import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/esm/Page/AnnotationLayer.css';
import 'react-pdf/dist/esm/Page/TextLayer.css';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { ForwardModal } from '../components/ForwardModal';
import { SendBackModal } from '../components/SendBackModal';

// Configure PDF.js worker
const PDFJS_VERSION = pdfjs.version;
const WORKER_URL = '/pdf.worker.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
console.log('📄 PDF.js API Version:', PDFJS_VERSION);
console.log('📄 PDF.js Worker configured:', pdfjs.GlobalWorkerOptions.workerSrc);

interface DocumentData {
  id: number;
  title: string;
  original_file_path: string;
  signed_file_path?: string;
  status: string;
  signer_name?: string;
  signer_email?: string;
}

export function DocumentPreview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState('');
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [workerReady, setWorkerReady] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (id) {
      loadDocument();
    }
  }, [id]);

  // Ensure PDF.js worker is properly initialized
  useEffect(() => {
    const initializeWorker = async () => {
      pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
      console.log('📄 PDF.js Worker URL set:', pdfjs.GlobalWorkerOptions.workerSrc);
      
      try {
        const response = await fetch(WORKER_URL, { method: 'HEAD' });
        if (response.ok) {
          console.log('✅ PDF.js worker file is accessible');
          setWorkerReady(true);
        } else {
          console.error('❌ PDF.js worker file not accessible:', response.status);
          setWorkerReady(true); // Still try to proceed
        }
      } catch (error) {
        console.error('❌ Failed to verify worker file:', error);
        setWorkerReady(true); // Still try to proceed
      }
    };
    
    initializeWorker();
  }, []);

  const loadDocument = async () => {
    try {
      console.log(`📄 Loading document ${id} for preview...`);
      const response = await api.get(`/documents/${id}`);
      const doc = response.data.document;
      console.log('📄 Document data:', doc);
      
      // If document is waiting for confirmation, get signer info
      if (doc.status === 'waiting_confirmation') {
        try {
          const waitingResponse = await api.get('/documents/waiting-confirmation');
          const waitingDocs = waitingResponse.data.documents || [];
          const waitingDoc = waitingDocs.find((d: any) => d.id === parseInt(id!));
          if (waitingDoc) {
            doc.signer_name = waitingDoc.signer_name;
            doc.signer_email = waitingDoc.signer_email;
          }
        } catch (error) {
          console.error('Failed to load signer info:', error);
        }
      }
      
      setDocument(doc);
      
      // Use signed file if available, otherwise use original
      const filePath = doc.signed_file_path || doc.original_file_path;
      console.log(`📄 Fetching PDF from: ${filePath}`);
      
      const pdfResponse = await api.get(`/documents/${id}/download`, {
        responseType: 'blob',
      });
      
      console.log('📄 PDF response received:', pdfResponse.data.size, 'bytes');
      
      if (!pdfResponse.data || pdfResponse.data.size === 0) {
        throw new Error('PDF file is empty or invalid');
      }
      
      const blob = new Blob([pdfResponse.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      console.log('📄 PDF URL created:', url);
      setPdfUrl(url);
    } catch (error: any) {
      console.error('❌ Failed to load document:', error);
      console.error('Error details:', error.response?.data || error.message);
      alert(`Failed to load document: ${error.response?.data?.error || error.message}`);
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    console.log('✅ PDF document loaded successfully, pages:', numPages);
    // Reset to page 1 if current page is out of bounds
    if (pageNumber > numPages) {
      setPageNumber(1);
    }
  };

  // Memoize pdfOptions to prevent unnecessary re-renders
  const pdfOptions = useMemo(() => ({
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/standard_fonts/`,
  }), []);

  const handleConfirm = async () => {
    if (!confirm('Are you sure you want to confirm this signed document?')) {
      return;
    }

    setConfirming(true);
    try {
      await api.post(`/documents/${id}/confirm`);
      alert('Document confirmed successfully!');
      navigate('/');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to confirm document');
    } finally {
      setConfirming(false);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await api.get(`/documents/${id}/download`, {
        responseType: 'blob',
      });
      
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = document.original_filename || `${document.title}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Download error:', error);
      alert(error.response?.data?.error || 'Failed to download document');
    }
  };

  const handleForward = async (selectedUserIds: number[], ccEmails: string[], externalEmails: string[]) => {
    await api.post(`/documents/${id}/forward`, {
      userIds: selectedUserIds,
      ccEmails,
      externalEmails,
    });
    alert('Document forwarded successfully!');
  };

  const handleSendBack = async (note: string) => {
    await api.post(`/documents/${id}/send-back`, { note });
    alert('Document sent back to signer successfully!');
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading document...</div>
      </div>
    );
  }

  if (!document || !pdfUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-red-600">Document not found</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <nav className="bg-white shadow px-4 py-2 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/')}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Dashboard
          </button>
          <h1 className="text-xl font-bold">{document.title}</h1>
          {document.signed_file_path && (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
              Signed Document
            </span>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {/* Action Buttons - Only show for management users and waiting_confirmation status */}
          {user?.role === 'management' && document.status === 'waiting_confirmation' && (
            <div className="flex items-center space-x-2">
              <button
                onClick={handleConfirm}
                disabled={confirming}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {confirming ? 'Confirming...' : 'Confirm'}
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Download
              </button>
              <button
                onClick={() => setShowForwardModal(true)}
                className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
              >
                Forward
              </button>
              <button
                onClick={() => setShowSendBackModal(true)}
                className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 text-sm"
              >
                Send Back
              </button>
            </div>
          )}
          {/* Download button for all users */}
          {(!user?.role || user.role !== 'management' || document.status !== 'waiting_confirmation') && (
            <button
              onClick={handleDownload}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Download
            </button>
          )}
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center space-x-2 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-medium">
              {user?.full_name.charAt(0).toUpperCase()}
            </div>
            <span className="text-gray-700">{user?.full_name}</span>
          </button>
        </div>
      </nav>
      
      <div className="flex-1 overflow-auto p-4 bg-gray-100">
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
            {!workerReady ? (
              <div className="text-center p-8">
                <div className="text-lg mb-2">Initializing PDF.js worker...</div>
                <div className="text-sm text-gray-500">Please wait</div>
              </div>
            ) : pdfUrl ? (
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={(error) => {
                  console.error('❌ PDF load error:', error);
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
                {numPages > 0 && pageNumber > 0 && pageNumber <= numPages && (
                  <div className="mb-4">
                    <Page
                      pageNumber={pageNumber}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                      onLoadError={(error) => {
                        console.error(`❌ Error loading page ${pageNumber}:`, error);
                      }}
                      error={
                        <div className="text-center p-4 text-red-600 bg-red-50 border border-red-200 rounded">
                          <p>Failed to load page {pageNumber}</p>
                        </div>
                      }
                    />
                  </div>
                )}
              </Document>
            ) : (
              <div className="text-center p-8 text-gray-500">
                No PDF loaded. Please wait...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <ForwardModal
        isOpen={showForwardModal}
        onClose={() => setShowForwardModal(false)}
        onForward={handleForward}
        documentTitle={document.title}
      />

      <SendBackModal
        isOpen={showSendBackModal}
        onClose={() => setShowSendBackModal(false)}
        onSendBack={handleSendBack}
        documentTitle={document.title}
        signerName={document.signer_name || 'Signer'}
      />
    </div>
  );
}

