#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <RTClib.h>
#include <EEPROM.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include "config.h"

#if !defined(ARDUINO_ARCH_AVR)
#error "This sketch targets AVR Uno/classic Nano/Mega. Adapt EEPROM for other boards."
#endif

MFRC522 rfid(UMBRAL_RFID_SS_PIN, UMBRAL_RFID_RST_PIN);
RTC_DS3231 rtc;

enum HelpState { IDLE, WAITING, REQUESTED, RECEIVED, ACCEPTED, ATTENDING, COMPLETED, CANCELLED, OFFLINE };
bool rtcValid = false, readerReady = false, identityReady = false;
uint32_t bootCounter = 0, eventCounter = 0;
struct HelpRequest {
  char event[37], uid[21], timestamp[24];
  HelpState state;
  bool awaitingAck;
  uint8_t sendCount;
  unsigned long firstSentAt, lastSentAt;
};
const uint8_t MAX_REQUESTS = 4;
HelpRequest requests[MAX_REQUESTS] = {};
uint8_t focusedRequest = 0;
char rxBuffer[128];
uint8_t rxLength = 0;
bool discardFrame = false, cardSeen = false;
unsigned long lastCardAt = 0, lastRxByteAt = 0;
static_assert(UMBRAL_STATUS_LED_PIN >= -1 && UMBRAL_STATUS_LED_PIN < NUM_DIGITAL_PINS, "Invalid LED pin");

// EEPROM bytes 0..17: two alternating records, each counter + inverse + commit.
// Commit the new counter before producing any IDs. Never overwrite the last
// valid record until the alternate one is durable.
bool readBootSlot(int base, uint32_t &value) {
  uint32_t inverse;
  if (EEPROM.read(base + 8) != 0xA5) return false;
  EEPROM.get(base, value);
  EEPROM.get(base + 4, inverse);
  return value != 0 && inverse == ~value;
}

bool reserveBootCounter() {
  if (EEPROM.length() < 18) return false;
  uint32_t a = 0, b = 0;
  const bool validA = readBootSlot(0, a), validB = readBootSlot(9, b);
  const bool latestA = validA && (!validB || a >= b);
  const uint32_t previous = latestA ? a : (validB ? b : 0);
  if (previous == UINT32_MAX) return false;
  bootCounter = previous + 1;
  const int target = latestA ? 9 : 0;
  const uint32_t inverse = ~bootCounter;
  EEPROM.update(target + 8, 0);
  EEPROM.put(target, bootCounter);
  EEPROM.put(target + 4, inverse);
  EEPROM.update(target + 8, 0xA5);
  uint32_t check;
  return readBootSlot(target, check) && check == bootCounter;
}

bool makeEventId(char *event) {
  if (!identityReady || eventCounter == UINT32_MAX) return false;
  ++eventCounter;
  // Namespace + persisted boot counter + sequence, with UUID version/variant.
  snprintf(event, 37, "%08lx-%04x-4000-8000-%04x%08lx",
    (unsigned long) UMBRAL_DEVICE_NAMESPACE, (unsigned int) (bootCounter >> 16),
    (unsigned int) (bootCounter & 0xffff), (unsigned long) eventCounter);
  return true;
}

bool reservedPin(int pin) {
  return pin == 0 || pin == 1 || pin == UMBRAL_RFID_SS_PIN || pin == UMBRAL_RFID_RST_PIN ||
    pin == MOSI || pin == MISO || pin == SCK || pin == SDA || pin == SCL;
}

#if UMBRAL_ENABLE_RELAYS
static_assert(UMBRAL_RELAY1_PIN >= 0 && UMBRAL_RELAY1_PIN < NUM_DIGITAL_PINS, "Define the real relay 1 pin");
static_assert(UMBRAL_RELAY2_PIN >= 0 && UMBRAL_RELAY2_PIN < NUM_DIGITAL_PINS, "Define the real relay 2 pin");
static_assert(UMBRAL_RELAY1_PIN != UMBRAL_RELAY2_PIN, "Relays need separate pins");
static_assert(UMBRAL_STATUS_LED_PIN != UMBRAL_RELAY1_PIN && UMBRAL_STATUS_LED_PIN != UMBRAL_RELAY2_PIN, "LED and relays need separate pins");
bool relaysReady = false;
bool relayActive[2] = { false, false };
unsigned long relayStartedAt[2] = { 0, 0 };
const int relayPins[2] = { UMBRAL_RELAY1_PIN, UMBRAL_RELAY2_PIN };
#endif

void openRelay(uint8_t relay) {
  if (relay != 1 && relay != 2) return;
#if UMBRAL_ENABLE_RELAYS
  if (!relaysReady || relayActive[relay - 1]) return;
  const uint8_t index = relay - 1;
  relayActive[index] = true;
  relayStartedAt[index] = millis();
  digitalWrite(relayPins[index], UMBRAL_RELAY_ACTIVE);
  Serial.print(F("RELAY_ACTIVADO,")); Serial.println(relay);
#else
  Serial.println(F("ERROR:RELES_NO_CONFIGURADOS"));
#endif
}

void tickRelays() {
#if UMBRAL_ENABLE_RELAYS
  for (uint8_t i = 0; i < 2; ++i) {
    if (relayActive[i] && (unsigned long)(millis() - relayStartedAt[i]) >= UMBRAL_RELAY_DURATION_MS) {
      digitalWrite(relayPins[i], UMBRAL_RELAY_INACTIVE);
      relayActive[i] = false;
      Serial.print(F("RELAY_DESACTIVADO,")); Serial.println(i + 1);
    }
  }
#endif
}

int stateRank(HelpState state) {
  switch (state) {
    case REQUESTED: return 1;
    case RECEIVED: return 2;
    case ACCEPTED: return 3;
    case ATTENDING: return 4;
    case COMPLETED: case CANCELLED: return 5;
    default: return 0;
  }
}

void handleCommand(char *line) {
  // Match the entire command; invalid relay values never fall back to relay 1.
  if (strcmp(line, "ABRIR,1") == 0 || strcmp(line, "CONCEDIDO,1") == 0) { openRelay(1); return; }
  if (strcmp(line, "ABRIR,2") == 0 || strcmp(line, "CONCEDIDO,2") == 0) { openRelay(2); return; }
  if (strcmp(line, "DENEGADO") == 0) { Serial.println(F("ACCESO_DENEGADO")); return; }
  if (strncmp(line, "ASISTENCIA,", 11) != 0) return;
  char *event = line + 11, *state = strchr(event, ',');
  if (!state) return;
  *state++ = '\0';
  HelpRequest *request = NULL;
  for (uint8_t i = 0; i < MAX_REQUESTS; ++i) {
    if (requests[i].event[0] && strcmp(event, requests[i].event) == 0) { request = &requests[i]; break; }
  }
  if (!request) return;
  HelpState next;
  if (strcmp(state, "solicitada") == 0) next = REQUESTED;
  else if (strcmp(state, "recibida") == 0) next = RECEIVED;
  else if (strcmp(state, "aceptada") == 0) next = ACCEPTED;
  else if (strcmp(state, "en_atencion") == 0) next = ATTENDING;
  else if (strcmp(state, "atendida") == 0) next = COMPLETED;
  else if (strcmp(state, "cancelada") == 0) next = CANCELLED;
  else return;
  // Ignore old/doubled packets after a newer state or terminal state.
  if (request->state == COMPLETED || request->state == CANCELLED || stateRank(next) < stateRank(request->state)) return;
  request->state = next;
  request->awaitingAck = false;
  Serial.print(F("ESTADO_AYUDA,")); Serial.print(request->event); Serial.print(','); Serial.println(state);
}

void readCommands() {
  if ((rxLength || discardFrame) && (unsigned long)(millis() - lastRxByteAt) > 1000UL) {
    rxLength = 0; discardFrame = false;
  }
  // Bound the work per loop so a noisy serial input cannot hold a relay open.
  uint8_t budget = 64;
  while (budget-- && Serial.available()) {
    const char c = (char)Serial.read();
    lastRxByteAt = millis();
    if (c == '\n') {
      if (!discardFrame && rxLength) {
        if (rxBuffer[rxLength - 1] == '\r') --rxLength;
        rxBuffer[rxLength] = '\0';
        handleCommand(rxBuffer);
      }
      rxLength = 0; discardFrame = false;
    } else if (!discardFrame) {
      if (c == '\0' || rxLength >= sizeof(rxBuffer) - 1) { discardFrame = true; rxLength = 0; }
      else rxBuffer[rxLength++] = c;
    }
  }
}

void captureTime(char *timestamp) {
  if (!rtcValid) {
    strcpy(timestamp, "RTC_NO_VALIDO");
    return;
  }
  const DateTime now = rtc.now();
  snprintf(timestamp, 24, "%04u-%02u-%02u %02u:%02u:%02u",
    now.year(), now.month(), now.day(), now.hour(), now.minute(), now.second());
}

void sendHelp(HelpRequest &request) {
  Serial.print(F("AYUDA,")); Serial.print(request.uid); Serial.print(',');
  Serial.print(request.timestamp); Serial.print(','); Serial.println(request.event);
  request.lastSentAt = millis();
  ++request.sendCount;
}

void tickRequest() {
  for (uint8_t i = 0; i < MAX_REQUESTS; ++i) {
    HelpRequest &request = requests[i];
    if (!request.awaitingAck) continue;
    const unsigned long now = millis();
    if ((unsigned long)(now - request.firstSentAt) >= UMBRAL_ACK_TIMEOUT_MS) {
      request.awaitingAck = false;
      request.state = OFFLINE;
      Serial.print(F("ERROR:SIN_CONFIRMACION_USAR_CANAL_ALTERNATIVO,")); Serial.println(request.event);
    } else if (request.sendCount < UMBRAL_MAX_SENDS && (unsigned long)(now - request.lastSentAt) >= UMBRAL_RETRY_INTERVAL_MS) {
      sendHelp(request);
    }
  }
}

void readCard() {
  if (!readerReady || !identityReady) return;
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  char uid[21];
  const char hex[] = "0123456789ABCDEF";
  const byte size = rfid.uid.size;
  if (size == 4 || size == 7 || size == 10) {
    for (byte i = 0; i < size; ++i) {
      uid[i * 2] = hex[rfid.uid.uidByte[i] >> 4];
      uid[i * 2 + 1] = hex[rfid.uid.uidByte[i] & 15];
    }
    uid[size * 2] = '\0';
  }
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  if (size != 4 && size != 7 && size != 10) return;
  const unsigned long now = millis();
  if (cardSeen && (unsigned long)(now - lastCardAt) < UMBRAL_CARD_COOLDOWN_MS) return;
  cardSeen = true; lastCardAt = now;
#if UMBRAL_ASSISTANCE_ONLY
  int slot = -1, freeSlot = -1;
  for (uint8_t i = 0; i < MAX_REQUESTS; ++i) {
    const bool reusable = !requests[i].event[0] || requests[i].state == COMPLETED || requests[i].state == CANCELLED;
    if (!reusable && strcmp(uid, requests[i].uid) == 0) { slot = i; break; }
    if (reusable && freeSlot < 0) freeSlot = i;
  }
  const bool sameActive = slot >= 0;
  if (slot < 0) slot = freeSlot;
  if (slot < 0) { Serial.println(F("ERROR:COLA_LOCAL_LLENA_USAR_CANAL_ALTERNATIVO")); return; }
  focusedRequest = (uint8_t)slot;
  HelpRequest &request = requests[slot];
  if (request.awaitingAck) { Serial.println(F("INFO:ESPERANDO_CONFIRMACION")); return; }
  if (!sameActive) {
    if (!makeEventId(request.event)) { Serial.println(F("ERROR:IDENTIFICADOR_NO_DISPONIBLE")); return; }
    strcpy(request.uid, uid);
    captureTime(request.timestamp);
  }
  // Re-presenting any tracked active card resends the same event, not a new one.
  request.firstSentAt = now; request.sendCount = 0; request.awaitingAck = true;
  if (!sameActive) request.state = WAITING;
  sendHelp(request);
#else
  char timestamp[24]; captureTime(timestamp);
  Serial.print(F("ACCESO,")); Serial.print(uid); Serial.print(','); Serial.println(timestamp);
#endif
}

void tickStatusLed() {
#if UMBRAL_STATUS_LED_PIN >= 0
  if (reservedPin(UMBRAL_STATUS_LED_PIN)) return;
  bool on = false;
  switch (requests[focusedRequest].state) {
    case WAITING: case REQUESTED: on = (millis() % 1000UL) < 150UL; break;
    case RECEIVED: on = (millis() % 500UL) < 150UL; break;
    case ACCEPTED: case ATTENDING: on = true; break;
    case OFFLINE: on = (millis() % 200UL) < 100UL; break;
    default: break;
  }
  digitalWrite(UMBRAL_STATUS_LED_PIN, on ? HIGH : LOW);
#endif
}

void setup() {
  Serial.begin(UMBRAL_SERIAL_BAUD);
#if UMBRAL_ENABLE_RELAYS
  relaysReady = !reservedPin(relayPins[0]) && !reservedPin(relayPins[1]);
  if (relaysReady) {
    for (uint8_t i = 0; i < 2; ++i) {
      digitalWrite(relayPins[i], UMBRAL_RELAY_INACTIVE);
      pinMode(relayPins[i], OUTPUT);
    }
  } else Serial.println(F("ERROR:PIN_RELE_EN_CONFLICTO"));
#endif
#if UMBRAL_STATUS_LED_PIN >= 0
  if (!reservedPin(UMBRAL_STATUS_LED_PIN)) {
    digitalWrite(UMBRAL_STATUS_LED_PIN, LOW);
    pinMode(UMBRAL_STATUS_LED_PIN, OUTPUT);
  } else Serial.println(F("ERROR:PIN_LED_EN_CONFLICTO"));
#endif
  SPI.begin(); rfid.PCD_Init(); Wire.begin();
  const byte readerVersion = rfid.PCD_ReadRegister(MFRC522::VersionReg);
  readerReady = readerVersion != 0x00 && readerVersion != 0xFF;
  if (!readerReady) Serial.println(F("ERROR:RFID_NO_ENCONTRADO"));
  rtcValid = rtc.begin();
  if (rtcValid) rtcValid = !rtc.lostPower();
  if (!rtcValid) Serial.println(F("AVISO:RTC_NO_VALIDO_SE_USARA_HORA_DEL_SERVIDOR"));
  identityReady = reserveBootCounter();
  if (!identityReady) Serial.println(F("ERROR:EEPROM_NO_DISPONIBLE_USAR_CANAL_ALTERNATIVO"));
  Serial.println(F("SISTEMA_LISTO"));
}

void loop() {
  tickRelays();
  readCommands();
  tickRequest();
  readCard();
  tickStatusLed();
}
