// hls.js espone la build "light" (`hls.js/light`) senza una dichiarazione di
// tipi dedicata: è la stessa API della build completa (hls.d.ts).
declare module 'hls.js/light' {
  import Hls from 'hls.js';
  export default Hls;
}
