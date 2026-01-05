import { useState, useEffect, useRef, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import Draggable from 'react-draggable';
import { Resizable } from 'react-resizable';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import 'react-resizable/css/styles.css';
import api from '../utils/api';
import './PDFSigningInterface.css';

// Configure PDF.js worker - use worker from public folder (matches react-pdf's pdfjs-dist version)
// CRITICAL: Worker version MUST match react-pdf's bundled pdfjs-dist version (4.8.69)
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
console.log('📄 PDF.js Worker configured:', pdfjs.GlobalWorkerOptions.workerSrc);
console.log('📄 PDF.js API Version:', pdfjs.version);

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
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const DEFAULT_TEXT_WIDTH = 200;
  const DEFAULT_TEXT_HEIGHT = 30;
  const DEFAULT_TEXT_FONT_SIZE = 14;
  const DEFAULT_SIGNATURE_WIDTH = 150;
  const DEFAULT_SIGNATURE_HEIGHT = 60;

  useEffect(() => {
    loadDraft();
  }, [documentId]);

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
  };

  const handlePageClick = (e: React.MouseEvent<HTMLDivElement>, pageNum: number) => {
    if (isReadOnly || mode === 'none') return;

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

  const addSignature = async (pageNum: number, x: number, y: number) => {
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
    
    const newSignature: Signature = {
      id: `sig-${Date.now()}-${Math.random()}`,
      page_number: pageNum,
      x_coordinate: x,
      y_coordinate: y,
      width: DEFAULT_SIGNATURE_WIDTH,
      height: DEFAULT_SIGNATURE_HEIGHT,
      signature_image_path: imagePath,
      imageUrl,
    };
    
    setSignatures([...signatures, newSignature]);
    setMode('none');
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
    
    try {
      const formData = new FormData();
      formData.append('signature', file);
      
      const response = await api.post('/signing/signature/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      const imagePath = response.data.signature_path;
      const imageUrl = await loadSignatureImage(imagePath);
      setSignatureImage(imagePath);
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to upload signature');
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
                  alert(`Failed to load PDF document: ${error.message || 'Unknown error'}. Please check console for details.`);
                }}
                loading={<div className="text-center p-8">Loading PDF...</div>}
                error={
                  <div className="text-center p-8 text-red-600">
                    Failed to load PDF file.
                  </div>
                }
              >
                {Array.from({ length: numPages }, (_, index) => index + 1).map((pageNum) => (
                  <div
                    key={pageNum}
                    ref={(el) => (pageRefs.current[pageNum] = el)}
                    className={`mb-4 ${pageNum !== pageNumber ? 'hidden' : ''}`}
                    onClick={(e) => handlePageClick(e, pageNum)}
                    style={{ position: 'relative', cursor: mode !== 'none' ? 'crosshair' : 'default' }}
                  >
                    <Page
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
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
                        onResize={(e, { size }) => {
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
                        onResize={(e, { size }) => {
                          updateSignature(sig.id, {
                            width: size.width / scale,
                            height: size.height / scale,
                          });
                        }}
                        disabled={isReadOnly}
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
          Click on the document to place text or signature
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
                className={`w-full px-4 py-2 rounded ${
                  mode === 'signature' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                Add Signature
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
              <h3 className="text-sm font-medium text-gray-700 mb-2">Create Signature</h3>
              <div className="flex space-x-2 mb-2">
                <button
                  onClick={clearSignature}
                  className="px-3 py-1 bg-gray-200 rounded text-sm"
                >
                  Clear
                </button>
              </div>
              
              <canvas
                ref={signatureCanvasRef}
                width={300}
                height={150}
                className="border border-gray-300 rounded cursor-crosshair"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                style={{ touchAction: 'none' }}
              />
              
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleSignatureUpload}
                className="mt-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Click to upload or drag and drop PNG, JPG up to 5MB
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

