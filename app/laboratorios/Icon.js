export default function Icon({name,size=20,...props}){
 const paths={
  bell:<><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  person:<><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  help:<><path d="M4 3h16v14H9l-5 4z"/><path d="M8 8h8M8 12h5"/></>,
  card:<><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8" cy="11" r="2"/><path d="M5 16c1-3 5-3 6 0M14 10h4M14 14h3"/></>,
  door:<><path d="M5 21V3l12 2v16M3 21h18M17 5h3v16"/><path d="M13 12v2"/></>,
  message:<><path d="M21 11a9 9 0 0 1-13 8l-5 2 2-5a9 9 0 1 1 16-5z"/><path d="m9 8 2 3 3 2 2-2"/></>,
  settings:<><circle cx="12" cy="12" r="3"/><path d="m10 3-1 3-3 1-3 3 2 2-1 4 3 1 2 4 3-1 3 1 2-4 3-1-1-4 2-2-3-3-3-1-1-3z"/></>,
  volume:<><path d="m11 4-6 5H2v6h3l6 5zM15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/></>,
  map:<><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16"/></>,
 };
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]||paths.help}</svg>;
}
