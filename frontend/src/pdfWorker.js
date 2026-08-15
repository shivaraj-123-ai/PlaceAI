import * as pdfjsLib from 'pdfjs-dist';

// Configure CDN worker path for PDF.js (v6+ uses module worker ending in .mjs)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export default pdfjsLib;
