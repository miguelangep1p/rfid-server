#pragma once

// MFRC522: preserve the pins supplied in the original sketch.
#define UMBRAL_RFID_SS_PIN 10
#define UMBRAL_RFID_RST_PIN 9

// Set these only after confirming the wiring. No relay pin is assumed.
#ifndef UMBRAL_ENABLE_RELAYS
#define UMBRAL_ENABLE_RELAYS 0
#endif
#ifndef UMBRAL_RELAY1_PIN
#define UMBRAL_RELAY1_PIN -1
#endif
#ifndef UMBRAL_RELAY2_PIN
#define UMBRAL_RELAY2_PIN -1
#endif
#define UMBRAL_RELAY_ACTIVE LOW
#define UMBRAL_RELAY_INACTIVE HIGH

// Optional separate status LED. Do not use D13 on Uno: it shares SPI SCK.
#ifndef UMBRAL_STATUS_LED_PIN
#define UMBRAL_STATUS_LED_PIN -1
#endif

// Must differ on each physical node. Change it if EEPROM is erased/replaced.
#define UMBRAL_DEVICE_NAMESPACE 0x554e5401UL

// Assistance-only by default. Legacy access mode is explicitly opt-in.
#ifndef UMBRAL_ASSISTANCE_ONLY
#define UMBRAL_ASSISTANCE_ONLY 1
#endif

#define UMBRAL_SERIAL_BAUD 9600
#define UMBRAL_RELAY_DURATION_MS 3000UL
#define UMBRAL_RETRY_INTERVAL_MS 3000UL
#define UMBRAL_ACK_TIMEOUT_MS 10000UL
#define UMBRAL_MAX_SENDS 3
#define UMBRAL_CARD_COOLDOWN_MS 1500UL
