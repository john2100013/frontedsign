import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PDFSigningInterface } from '../components/PDFSigningInterface';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

interface Document {
  id: number;
  title: string;
  original_file_path: string;
  signed_file_path?: string;
  status: string;
  recipient_status?: string;
}

export function DocumentSign() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [document, setDocument] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);

  useEffect(() => {
    if (id) {
      loadDocument();
    }
  }, [id]);

  const loadDocument = async () => {
    try {
      console.log(`📄 Loading document ${id}...`);
      const response = await api.get(`/documents/${id}`);
      const doc = response.data.document;
      console.log('📄 Document data:', doc);
      setDocument(doc);
      
      // Check if document is already signed
      if (doc.recipient_status === 'signed' || doc.status === 'signed') {
        setIsReadOnly(true);
      }
      
      // Get PDF URL
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

  const handleSaveDraft = () => {
    // Draft saved, could show a toast notification
    console.log('Draft saved');
  };

  const handleSubmit = () => {
    // Document submitted, navigate back
    // The document status is now 'waiting_confirmation'
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
            ← Back
          </button>
          <h1 className="text-xl font-bold">{document.title}</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center space-x-2 px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-medium">
              {user?.full_name.charAt(0).toUpperCase()}
            </div>
            <span className="text-gray-700">{user?.full_name}</span>
          </button>
          {isReadOnly && (
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
              Signed
            </span>
          )}
        </div>
      </nav>
      
      <PDFSigningInterface
        documentId={parseInt(id!)}
        pdfUrl={pdfUrl}
        onSaveDraft={handleSaveDraft}
        onSubmit={handleSubmit}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}

