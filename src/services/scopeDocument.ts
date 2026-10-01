// Carga de documentos de alcance (PDF, DOCX, TXT/MD/CSV) para enviarlos a la IA.

export interface LoadedFile {
  name: string;
  type: 'pdf' | 'docx' | 'text';
  // PDF: base64 (Gemini lo lee nativo). Resto: texto extraído.
  content: string;
  isPdf: boolean;
  sizeLabel: string;
}

export type ScopeDocInput = { kind: 'pdf'; base64: string } | { kind: 'text'; text: string };

export const ACCEPTED_SCOPE_EXTENSIONS = '.pdf,.docx,.txt,.md,.csv';

const sizeLabel = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res((reader.result as string).split(',')[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });

const extractDocxText = async (file: File): Promise<string> => {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
};

export const loadScopeDocument = async (file: File): Promise<LoadedFile> => {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const size = sizeLabel(file.size);

  if (ext === 'pdf') {
    if (file.size > 20 * 1024 * 1024) throw new Error('El PDF supera el límite de 20 MB.');
    return { name: file.name, type: 'pdf', content: await fileToBase64(file), isPdf: true, sizeLabel: size };
  }
  if (ext === 'docx') {
    const text = await extractDocxText(file);
    if (!text.trim()) throw new Error('No se pudo extraer texto del archivo .docx');
    return { name: file.name, type: 'docx', content: text, isPdf: false, sizeLabel: size };
  }
  if (['txt', 'md', 'csv'].includes(ext)) {
    return { name: file.name, type: 'text', content: await file.text(), isPdf: false, sizeLabel: size };
  }
  throw new Error(`Formato no soportado: .${ext}. Usa PDF, DOCX, TXT o MD.`);
};

export const toScopeInput = (file: LoadedFile): ScopeDocInput =>
  file.isPdf ? { kind: 'pdf', base64: file.content } : { kind: 'text', text: file.content };
