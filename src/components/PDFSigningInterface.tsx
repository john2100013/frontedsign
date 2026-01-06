import { useState, useEffect, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import Draggable from 'react-draggable';
import { Resizable } from 'react-resizable';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-resizable/css/styles.css';
import api from '../utils/api';
import './PDFSigningInterface.css';

// Configure PDF.js worker - use CDN worker for better reliability
// CRITICAL: Worker version MUST match react-pdf's bundled pdfjs-dist version
const PDFJS_VERSION = pdfjs.version;
console.log('📄 PDF.js API Version:', PDFJS_VERSION);

// Use CDN worker as primary (more reliable than local file)
// Fallback to local if CDN fails
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.mjs`;
console.log('📄 PDF.js Worker configured (CDN):', pdfjs.GlobalWorkerOptions.workerSrc);

// Test worker availability
const testWorker = async () => {
  try {
    // Try to fetch the worker to verify it's accessible
    const response = await fetch(pdfjs.GlobalWorkerOptions.workerSrc, { method: 'HEAD' });
    if (!response.ok) {
      throw new Error('CDN worker not accessible');
    }
    console.log('✅ PDF.js worker is accessible');
  } catch (error) {
    console.warn('⚠️ CDN worker test failed, trying local worker:', error);
    // Fallback to local worker
    pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    console.log('📄 Using local PDF.js worker:', pdfjs.GlobalWorkerOptions.workerSrc);
  }
};

// Test worker in background (non-blocking)
testWorker().catch(() => {
  // If CDN fails, use local as fallback
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
});

interface TextField {
  id: string;
  page_number: number;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
  font_size: number;
  text_content: string;
}

interface Signature {
  id: string;
  page_number: number;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
  signature_image_path: string;
  imageUrl?: string;
}

interface PDFSigningInterfaceProps {
  documentId: number;
  pdfUrl: string;
  onSaveDraft: () => void;
  onSubmit: () => void;
  isReadOnly?: boolean;
}

export function PDFSigningInterface({
  documentId,
  pdfUrl,
  onSaveDraft,
  onSubmit,
  isReadOnly = false,
}: PDFSigningInterfaceProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [mode, setMode] = useState<'none' | 'text' | 'signature'>('none');
  const [textFields, setTextFields] = useState<TextField[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftData, setDraftData] = useState<any>(null);
  const [pdfReady, setPdfReady] = useState(false);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Memoize PDF.js options to prevent unnecessary reloads
  const pdfOptions = useMemo(() => ({
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  }), []);

  const DEFAULT_TEXT_WIDTH = 200;
  const DEFAULT_TEXT_HEIGHT = 30;
  const DEFAULT_TEXT_FONT_SIZE = 14;
  const DEFAULT_SIGNATURE_WIDTH = 150;
  const DEFAULT_SIGNATURE_HEIGHT = 60;
  const MAX_SIGNATURE_WIDTH = 250; // Maximum width for auto-resized signatures
  const MAX_SIGNATURE_HEIGHT = 100; // Maximum height for auto-resized signatures
  const MIN_SIGNATURE_WIDTH = 80; // Minimum width
  const MIN_SIGNATURE_HEIGHT = 30; // Minimum height

  useEffect(() => {
    loadDraft();
  }, [documentId]);

  // Ensure PDF.js worker is properly initialized - run on every render to prevent null worker
  useEffect(() => {
    // Always ensure worker is configured - this prevents it from becoming null
    const workerUrl = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
    if (!pdfjs.GlobalWorkerOptions.workerSrc || pdfjs.GlobalWorkerOptions.workerSrc !== workerUrl) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      console.log('🔄 PDF.js worker reinitialized:', pdfjs.GlobalWorkerOptions.workerSrc);
    }
  });

  const loadDraft = async () => {
    try {
      const response = await api.get(`/signing/${documentId}/draft`);
      const data = response.data;
      
      if (data.textFields && data.textFields.length > 0) {
        setTextFields(data.textFields.map((tf: any) => ({
          ...tf,
          id: tf.id?.toString() || `text-${Date.now()}-${Math.random()}`,
        })));
      }
      
      if (data.signatures && data.signatures.length > 0) {
        const sigsWithUrls = await Promise.all(
          data.signatures.map(async (sig: any) => {
            const imageUrl = await loadSignatureImage(sig.signature_image_path);
            return {
              ...sig,
              id: sig.id?.toString() || `sig-${Date.now()}-${Math.random()}`,
              imageUrl,
            };
          })
        );
        setSignatures(sigsWithUrls);
      }
    } catch (error) {
      console.log('No draft found or error loading draft');
    }
  };

  const loadSignatureImage = async (path: string): Promise<string> => {
    try {
      const filename = path.split('/').pop() || path.split('\\').pop() || path;
      const response = await api.get(`/signing/signatures/${filename}`, {
        responseType: 'blob',
      });
      return URL.createObjectURL(response.data);
    } catch (error) {
      console.error('Failed to load signature image:', error);
      return '';
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPdfReady(true);
    console.log('✅ PDF document loaded successfully, ready for interactions');
  };

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    if (isReadOnly || mode === 'none' || !pdfReady) {
      if (!pdfReady) {
        console.warn('⚠️ PDF not ready yet, please wait...');
      }
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (mode === 'text') {
      addTextField(pageNum, x, y);
    } else if (mode === 'signature') {
      addSignature(pageNum, x, y);
    }
  };

  const addTextField = (pageNum: number, x: number, y: number) => {
    const newField: TextField = {
      id: `text-${Date.now()}-${Math.random()}`,
      page_number: pageNum,
      x_coordinate: x,
      y_coordinate: y,
      width: DEFAULT_TEXT_WIDTH,
      height: DEFAULT_TEXT_HEIGHT,
      font_size: DEFAULT_TEXT_FONT_SIZE,
      text_content: fullName || '',
    };
    
    setTextFields([...textFields, newField]);
    setActiveField(newField.id);
    setMode('none');
  };

  // Helper function to get image dimensions and calculate auto-size
  const getImageDimensions = (imageUrl: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        let width = img.width;
        let height = img.height;
        
        // Scale down if too large, maintaining aspect ratio
        if (width > MAX_SIGNATURE_WIDTH) {
          width = MAX_SIGNATURE_WIDTH;
          height = width / aspectRatio;
        }
        if (height > MAX_SIGNATURE_HEIGHT) {
          height = MAX_SIGNATURE_HEIGHT;
          width = height * aspectRatio;
        }
        
        // Ensure minimum size
        if (width < MIN_SIGNATURE_WIDTH) {
          width = MIN_SIGNATURE_WIDTH;
          height = width / aspectRatio;
        }
        if (height < MIN_SIGNATURE_HEIGHT) {
          height = MIN_SIGNATURE_HEIGHT;
          width = height * aspectRatio;
        }
        
        resolve({ width, height });
      };
      img.onerror = reject;
      img.src = imageUrl;
    });
  };

  const addSignature = async (pageNum: number, x: number, y: number) => {
    // Ensure worker is initialized before adding signature (prevents null worker errors)
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
      console.log('🔄 Worker reinitialized before adding signature');
    }
    
    let imagePath = signatureImage;
    
    // If no uploaded image, check if canvas has drawing
    if (!imagePath && signatureCanvasRef.current) {
      const canvas = signatureCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Check if canvas has any content
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
      const hasContent = imageData?.data.some((pixel, index) => {
        // Check alpha channel (every 4th value)
        return index % 4 === 3 && pixel > 0;
      });
      
      if (hasContent) {
        // Convert canvas to image
        const dataUrl = canvas.toDataURL('image/png');
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const formData = new FormData();
          formData.append('signature', blob, 'signature.png');
          
          const response = await api.post('/signing/signature/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          imagePath = response.data.signature_path;
        } catch (error) {
          console.error('Failed to upload signature:', error);
          return;
        }
      }
    }
    
    if (!imagePath) {
      alert('Please create or upload a signature first');
      return;
    }
    
    const imageUrl = await loadSignatureImage(imagePath);
    
    // Get auto-calculated dimensions based on actual image size
    let signatureWidth = DEFAULT_SIGNATURE_WIDTH;
    let signatureHeight = DEFAULT_SIGNATURE_HEIGHT;
    
    try {
      const dimensions = await getImageDimensions(imageUrl);
      signatureWidth = dimensions.width;
      signatureHeight = dimensions.height;
      console.log('📏 Auto-resized signature:', { width: signatureWidth, height: signatureHeight });
    } catch (error) {
      console.warn('Failed to get image dimensions, using defaults:', error);
    }
    
    const newSignature: Signature = {
      id: `sig-${Date.now()}-${Math.random()}`,
      page_number: pageNum,
      x_coordinate: x,
      y_coordinate: y,
      width: signatureWidth,
      height: signatureHeight,
      signature_image_path: imagePath,
      imageUrl,
    };
    
    // Use functional update to prevent stale closure issues
    setSignatures(prev => [...prev, newSignature]);
    setMode('none');
    setActiveField(newSignature.id);
    
    // Clear canvas after placing signature
    if (signatureCanvasRef.current) {
      const canvas = signatureCanvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const updateTextField = (id: string, updates: Partial<TextField>) => {
    setTextFields(textFields.map(field => 
      field.id === id ? { ...field, ...updates } : field
    ));
  };

  const updateSignature = (id: string, updates: Partial<Signature>) => {
    setSignatures(signatures.map(sig => 
      sig.id === id ? { ...sig, ...updates } : sig
    ));
  };

  const deleteField = (id: string, type: 'text' | 'signature') => {
    if (type === 'text') {
      setTextFields(textFields.filter(f => f.id !== id));
    } else {
      setSignatures(signatures.filter(s => s.id !== id));
    }
  };

  const handleSaveDraft = async () => {
    try {
      await api.post(`/signing/${documentId}/draft`, {
        textFields: textFields.map(tf => ({
          page_number: tf.page_number,
          x_coordinate: tf.x_coordinate,
          y_coordinate: tf.y_coordinate,
          width: tf.width,
          height: tf.height,
          font_size: tf.font_size,
          text_content: tf.text_content,
        })),
        signatures: signatures.map(sig => ({
          page_number: sig.page_number,
          x_coordinate: sig.x_coordinate,
          y_coordinate: sig.y_coordinate,
          width: sig.width,
          height: sig.height,
          signature_image_path: sig.signature_image_path,
        })),
      });
      
      alert('Draft saved successfully');
      onSaveDraft();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to save draft');
    }
  };

  const handleSubmit = async () => {
    if (!confirm('Are you sure you want to submit? The document will become read-only.')) {
      return;
    }

    try {
      await api.post(`/signing/${documentId}/submit`, {
        textFields: textFields.map(tf => ({
          page_number: tf.page_number,
          x_coordinate: tf.x_coordinate,
          y_coordinate: tf.y_coordinate,
          width: tf.width,
          height: tf.height,
          font_size: tf.font_size,
          text_content: tf.text_content,
        })),
        signatures: signatures.map(sig => ({
          page_number: sig.page_number,
          x_coordinate: sig.x_coordinate,
          y_coordinate: sig.y_coordinate,
          width: sig.width,
          height: sig.height,
          signature_image_path: sig.signature_image_path,
        })),
      });
      
      alert('Document signed successfully!');
      onSubmit();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to submit signature');
    }
  };

  useEffect(() => {
    // Setup canvas for drawing
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureImage(null);
  };

  const handleSignatureUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Validate file size (5MB = 5 * 1024 * 1024 bytes)
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    if (file.size > MAX_FILE_SIZE) {
      alert(`File is too large. Maximum size is 5MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
      e.target.value = ''; // Clear the input
      return;
    }
    
    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      alert('Invalid file type. Please upload a PNG or JPEG image.');
      e.target.value = ''; // Clear the input
      return;
    }
    
    // Validate image dimensions (optional - check if image is reasonable size)
    try {
      const img = new Image();
      const imageUrl = URL.createObjectURL(file);
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          URL.revokeObjectURL(imageUrl);
          // Check if image dimensions are reasonable (max 2000x2000px)
          if (img.width > 2000 || img.height > 2000) {
            reject(new Error(`Image dimensions are too large. Maximum is 2000x2000px. Your image is ${img.width}x${img.height}px`));
          } else {
            resolve(null);
          }
        };
        img.onerror = () => {
          URL.revokeObjectURL(imageUrl);
          reject(new Error('Failed to load image. Please ensure it is a valid image file.'));
        };
        img.src = imageUrl;
      });
    } catch (error: any) {
      alert(error.message || 'Failed to validate image');
      e.target.value = ''; // Clear the input
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('signature', file);
      
      const response = await api.post('/signing/signature/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const imagePath = response.data.signature_path;
      const imageUrl = await loadSignatureImage(imagePath);
      setSignatureImage(imagePath);
      console.log('✅ Signature uploaded successfully:', { size: file.size, path: imagePath });
    } catch (error: any) {
      console.error('❌ Signature upload error:', error);
      alert(error.response?.data?.error || 'Failed to upload signature. Please try again.');
      e.target.value = ''; // Clear the input
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Left: PDF Viewer */}
      <div className="flex-1 overflow-auto p-4">
        <div className="mb-4 flex items-center justify-between bg-white p-2 rounded shadow">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setPageNumber(Math.max(1, pageNumber - 1))}
              disabled={pageNumber <= 1}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm">
              Page {pageNumber} of {numPages}
            </span>
            <button
              onClick={() => setPageNumber(Math.min(numPages, pageNumber + 1))}
              disabled={pageNumber >= numPages}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.1))}
              className="px-3 py-1 bg-gray-200 rounded"
            >
              -
            </button>
            <span className="text-sm">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(Math.min(2, scale + 0.1))}
              className="px-3 py-1 bg-gray-200 rounded"
            >
              +
            </button>
            <button
              onClick={() => setScale(1.0)}
              className="px-3 py-1 bg-gray-200 rounded"
            >
              Fit
            </button>
          </div>
        </div>

        <div className="flex justify-center">
          <div className="relative">
            {pdfUrl ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => {
                  console.error('❌ PDF load error:', error);
                  console.error('Error details:', error.message, error);
                  
                  // Check if it's a worker error
                  if (error.message?.includes('worker') || error.message?.includes('sendWithPromise')) {
                    console.error('⚠️ PDF.js worker error detected. Attempting to reinitialize...');
                    // Try to reinitialize the worker
                    try {
                      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
                      console.log('🔄 Worker reinitialized');
                    } catch (reinitError) {
                      console.error('❌ Failed to reinitialize worker:', reinitError);
                    }
                  }
                  
                  alert(`Failed to load PDF document: ${error.message || 'Unknown error'}. Please refresh the page and try again.`);
                }}
                loading={<div className="text-center p-8">Loading PDF...</div>}
                error={
                  <div className="text-center p-8 text-red-600">
                    <p className="mb-2">Failed to load PDF file.</p>
                    <button
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      Reload Page
                    </button>
                  </div>
                }
                options={pdfOptions}
              >
                {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNum) => (
                  <div
                    key={pageNum}
                    ref={(el) => {
                      pageRefs.current[pageNum] = el;
                    }}
                    className={`mb-4 ${pageNum !== pageNumber ? 'hidden' : ''}`}
                    onClick={(e) => handlePageClick(e, pageNum)}
                    style={{ 
                      position: 'relative', 
                      cursor: mode !== 'none' ? 'crosshair' : 'default',
                      outline: mode === 'signature' ? '2px dashed #3b82f6' : 'none',
                      outlineOffset: mode === 'signature' ? '4px' : '0',
                    }}
                  >
                    <Page
                      key={`page-${pageNum}-${signatures.length}`}
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      onLoadError={(error) => {
                        console.error(`❌ Error loading page ${pageNum}:`, error);
                        if (error.message?.includes('worker') || error.message?.includes('sendWithPromise')) {
                          console.error('⚠️ Page load worker error. Reinitializing worker...');
                          // Reinitialize worker immediately
                          pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
                          // Force re-render by updating a state
                          setPageNumber(prev => prev);
                        }
                      }}
                      error={
                        <div className="text-center p-4 text-red-600 bg-red-50 border border-red-200 rounded">
                          <p>Failed to load page {pageNum}</p>
                          <button
                            onClick={() => {
                              // Reinitialize worker and retry
                              pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
                              setPageNumber(prev => prev === pageNum ? prev + 0.1 : prev);
                            }}
                            className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                          >
                            Retry
                          </button>
                        </div>
                      }
                    />
                
                {/* Render text fields for this page */}
                {textFields
                  .filter(tf => tf.page_number === pageNum)
                  .map(tf => (
                    <Draggable
                      key={tf.id}
                      disabled={isReadOnly}
                      onStop={(e, data) => {
                        updateTextField(tf.id, {
                          x_coordinate: data.x / scale,
                          y_coordinate: data.y / scale,
                        });
                      }}
                      position={{
                        x: tf.x_coordinate * scale,
                        y: tf.y_coordinate * scale,
                      }}
                    >
                      <Resizable
                        width={tf.width * scale}
                        height={tf.height * scale}
                        onResize={(_e: any, { size }: { size: { width: number; height: number } }) => {
                          updateTextField(tf.id, {
                            width: size.width / scale,
                            height: size.height / scale,
                          });
                        }}
                        disabled={isReadOnly}
                      >
                        <div
                          className={`absolute border-2 ${activeField === tf.id ? 'border-blue-500' : 'border-transparent'} bg-white bg-opacity-90 p-1`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveField(tf.id);
                          }}
                        >
                          {activeField === tf.id && !isReadOnly && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteField(tf.id, 'text');
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                            >
                              ×
                            </button>
                          )}
                          <input
                            type="text"
                            value={tf.text_content}
                            onChange={(e) => {
                              const newText = e.target.value;
                              updateTextField(tf.id, { text_content: newText });
                              
                              // Auto-resize based on text length
                              const newWidth = Math.max(DEFAULT_TEXT_WIDTH, newText.length * 8);
                              updateTextField(tf.id, { width: newWidth });
                            }}
                            onFocus={() => setActiveField(tf.id)}
                            disabled={isReadOnly}
                            className="w-full border-none outline-none bg-transparent"
                            style={{
                              fontSize: `${tf.font_size * scale}px`,
                              width: `${tf.width * scale}px`,
                              height: `${tf.height * scale}px`,
                            }}
                          />
                        </div>
                      </Resizable>
                    </Draggable>
                  ))}
                
                {/* Render signatures for this page */}
                {signatures
                  .filter(sig => sig.page_number === pageNum)
                  .map(sig => (
                    <Draggable
                      key={sig.id}
                      disabled={isReadOnly}
                      onStop={(e, data) => {
                        updateSignature(sig.id, {
                          x_coordinate: data.x / scale,
                          y_coordinate: data.y / scale,
                        });
                      }}
                      position={{
                        x: sig.x_coordinate * scale,
                        y: sig.y_coordinate * scale,
                      }}
                    >
                      <Resizable
                        width={sig.width * scale}
                        height={sig.height * scale}
                        onResize={(_e: any, { size }: { size: { width: number; height: number } }) => {
                          // Maintain aspect ratio when resizing
                          const aspectRatio = sig.width / sig.height;
                          let newWidth = size.width / scale;
                          let newHeight = size.height / scale;
                          
                          // Determine which dimension changed more (user intent)
                          const widthChange = Math.abs(newWidth - sig.width);
                          const heightChange = Math.abs(newHeight - sig.height);
                          
                          if (widthChange > heightChange) {
                            // Width changed more, adjust height to maintain aspect ratio
                            newHeight = newWidth / aspectRatio;
                          } else {
                            // Height changed more, adjust width to maintain aspect ratio
                            newWidth = newHeight * aspectRatio;
                          }
                          
                          updateSignature(sig.id, {
                            width: newWidth,
                            height: newHeight,
                          });
                        }}
                        disabled={isReadOnly}
                        minConstraints={[MIN_SIGNATURE_WIDTH * scale, MIN_SIGNATURE_HEIGHT * scale]}
                        maxConstraints={[MAX_SIGNATURE_WIDTH * scale, MAX_SIGNATURE_HEIGHT * scale]}
                      >
                        <div
                          className="absolute border-2 border-blue-500 bg-white bg-opacity-90"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveField(sig.id);
                          }}
                        >
                          {activeField === sig.id && !isReadOnly && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteField(sig.id, 'signature');
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 text-xs"
                            >
                              ×
                            </button>
                          )}
                          {sig.imageUrl && (
                            <img
                              src={sig.imageUrl}
                              alt="Signature"
                              style={{
                                width: `${sig.width * scale}px`,
                                height: `${sig.height * scale}px`,
                                objectFit: 'contain',
                              }}
                            />
                          )}
                        </div>
                      </Resizable>
                    </Draggable>
                  ))}
              </div>
            ))}
              </Document>
            ) : (
              <div className="text-center p-8 text-gray-500">
                No PDF loaded. Please wait...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Signing Panel */}
      <div className="w-80 bg-white shadow-lg p-6 overflow-y-auto">
        <h2 className="text-xl font-bold mb-2">Sign Document</h2>
        <p className="text-sm text-gray-600 mb-4">
          {mode === 'signature' 
            ? '✏️ Signature mode: Click on the document to place your signature'
            : mode === 'text'
            ? '📝 Text mode: Click on the document to place text'
            : 'Click "Add Text" or "Add Signature" then click on document to place'}
        </p>

        {!isReadOnly && (
          <>
            <div className="mb-4">
              <button
                onClick={() => {
                  setMode(mode === 'text' ? 'none' : 'text');
                  setActiveField(null);
                }}
                className={`w-full px-4 py-2 rounded mb-2 ${
                  mode === 'text' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                Add Text
              </button>
              <button
                onClick={() => {
                  setMode(mode === 'signature' ? 'none' : 'signature');
                  setActiveField(null);
                }}
                className={`w-full px-4 py-2 rounded transition-all ${
                  mode === 'signature' 
                    ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300' 
                    : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                {mode === 'signature' ? '✓ Signature Mode Active' : 'Add Signature'}
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Legal Name *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full legal name"
                className="w-full px-3 py-2 border border-gray-300 rounded"
              />
              <p className="text-xs text-gray-500 mt-1">
                Click "Add Text" then click on document to place.
              </p>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                {mode === 'signature' ? '✓ Ready to Place Signature' : 'Create Signature'}
              </h3>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={clearSignature}
                  className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300"
                >
                  Clear Canvas
                </button>
                {signatureImage && (
                  <button
                    onClick={() => setSignatureImage(null)}
                    className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300"
                  >
                    Clear Uploaded
                  </button>
                )}
              </div>
              
              <div className="mb-2">
                <p className="text-xs text-gray-600 mb-1">
                  Option 1: Draw signature below
                </p>
                <canvas
                  ref={signatureCanvasRef}
                  width={300}
                  height={150}
                  className={`border-2 rounded cursor-crosshair ${
                    mode === 'signature' ? 'border-blue-500 shadow-md' : 'border-gray-300'
                  }`}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  style={{ touchAction: 'none' }}
                />
              </div>
              
              <div className="mt-3">
                <p className="text-xs text-gray-600 mb-1">
                  Option 2: Upload signature image
                </p>
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={handleSignatureUpload}
                  className="text-sm w-full"
                />
                {signatureImage && (
                  <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                    <p className="text-xs text-green-700">✓ Signature uploaded and ready</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {mode === 'signature' 
                  ? '💡 Click anywhere on the PDF to place your signature'
                  : '💡 Create or upload a signature, then click "Add Signature" button'}
              </p>
            </div>
          </>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
          <input
            type="email"
            value={localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!).email : ''}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
          <input
            type="text"
            value={new Date().toLocaleDateString()}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100"
          />
        </div>

        {!isReadOnly && (
          <div className="space-y-2">
            <button
              onClick={handleSaveDraft}
              className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Save as Draft
            </button>
            <button
              onClick={handleSubmit}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Submit & Sign Document
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

