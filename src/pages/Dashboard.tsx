import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { formatDistanceToNow } from 'date-fns';

interface Document {
  id: number;
  title: string;
  status: string;
  created_at: string;
  uploaded_by_name: string;
  recipient_status?: string;
  due_date?: string;
  signed_at?: string;
}

interface Stats {
  totalDocuments?: number;
  totalDocumentsTrend?: number;
  pendingSignatures?: number;
  pendingDocuments?: number;
  signedDocuments?: number;
  signedDocumentsTrend?: number;
  draftDocuments?: number;
  waitingConfirmation?: number;
  sentForSigning?: number;
  sentBackForSigning?: number;
}

interface Activity {
  action: string;
  document_id: number;
  document_title: string;
  timestamp: string;
  recipient_email?: string;
  recipient_name?: string;
  actor_name?: string;
  sender_name?: string;
  status?: string;
}

export function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [assignedDocuments, setAssignedDocuments] = useState<Document[]>([]);
  const [assignedToSign, setAssignedToSign] = useState<Document[]>([]);
  const [waitingConfirmation, setWaitingConfirmation] = useState<Document[]>([]);
  const [sentBackForSigning, setSentBackForSigning] = useState<Document[]>([]); // Documents I sent back (for management) or sent back to me (for recipients)
  const [sentBackToMe, setSentBackToMe] = useState<Document[]>([]); // Documents sent back to me (for management who are also recipients)
  const [stats, setStats] = useState<Stats>({});
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [recipientEmails, setRecipientEmails] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'draft' | 'signed'>('all');

  useEffect(() => {
    if (user?.role === 'management') {
      loadDocuments();
      loadStats();
      loadActivity();
      loadWaitingConfirmation();
      loadAssignedToSign(); // Management users can also be assigned documents
      loadSentBackForSigning(); // Management users can see documents they sent back
    } else {
      loadAssignedDocuments();
      loadAssignedToSign();
      loadSentBackForSigning();
      loadStats();
    }
  }, [user]);

  const loadDocuments = async () => {
    try {
      const response = await api.get('/documents');
      setDocuments(response.data.documents);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignedDocuments = async () => {
    try {
      const response = await api.get('/documents/assigned/me');
      if (user?.role === 'management') {
        // For management users, store assigned docs separately
        setAssignedDocuments(response.data.documents);
      } else {
        // For recipients, assigned docs are their main documents
        setDocuments(response.data.documents);
      }
    } catch (error) {
      console.error('Failed to load assigned documents:', error);
    } finally {
      if (user?.role !== 'management') {
        setLoading(false);
      }
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get('/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadActivity = async () => {
    try {
      const response = await api.get('/dashboard/activity?limit=10');
      setActivities(response.data.activities || []);
    } catch (error) {
      console.error('Failed to load activity:', error);
    }
  };

  const loadAssignedToSign = async () => {
    try {
      const response = await api.get('/documents/assigned-to-sign');
      const docs = response.data.documents || [];
      console.log('📋 Assigned to Sign documents:', docs.length, docs);
      setAssignedToSign(docs);
    } catch (error) {
      console.error('Failed to load assigned to sign:', error);
      setAssignedToSign([]);
    }
  };

  const loadWaitingConfirmation = async () => {
    try {
      const response = await api.get('/documents/waiting-confirmation');
      const docs = response.data.documents || [];
      console.log('⏳ Waiting for Confirmation documents:', docs.length, docs);
      setWaitingConfirmation(docs);
    } catch (error) {
      console.error('Failed to load waiting confirmation:', error);
      setWaitingConfirmation([]);
    }
  };

  const loadSentBackForSigning = async () => {
    try {
      const response = await api.get('/documents/sent-back-for-signing');
      const docs = response.data.documents || [];
      console.log('🔄 Sent Back for Signing documents:', docs.length, docs);
      
      if (user?.role === 'management') {
        // For management: these are documents they sent back
        setSentBackForSigning(docs);
        // Also check if they have documents sent back to them (as recipients)
        await loadSentBackToMe();
      } else {
        // For recipients: these are documents sent back to them
        setSentBackForSigning(docs);
      }
    } catch (error) {
      console.error('Failed to load sent back for signing:', error);
      setSentBackForSigning([]);
    }
  };

  const loadSentBackToMe = async () => {
    try {
      // For management users, get documents sent back to them (where they are recipients, not owners)
      const response = await api.get('/documents/sent-back-to-me');
      const docs = response.data.documents || [];
      console.log('🔄 Sent Back to Me documents (for management as recipient):', docs.length, docs);
      setSentBackToMe(docs);
    } catch (error) {
      console.error('Failed to load sent back to me:', error);
      setSentBackToMe([]);
    }
  };

  const handleConfirm = async (documentId: number) => {
    if (!confirm('Are you sure you want to confirm this signed document?')) {
      return;
    }

    setConfirming(documentId);
    try {
      await api.post(`/documents/${documentId}/confirm`);
      alert('Document confirmed successfully!');
      loadDocuments();
      loadWaitingConfirmation();
      loadStats();
      loadActivity();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to confirm document');
    } finally {
      setConfirming(null);
    }
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await api.get('/auth/users');
      setAllUsers(response.data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('document', uploadFile);
      formData.append('title', uploadTitle || uploadFile.name);

      await api.post('/documents/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setShowUploadModal(false);
      setUploadTitle('');
      setUploadFile(null);
      loadDocuments();
      loadStats();
      loadActivity();
      loadWaitingConfirmation();
      loadWaitingConfirmation();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocument || (!recipientEmails.trim() && selectedUsers.length === 0)) {
      alert('Please enter email addresses or select existing users');
      return;
    }

    setAssigning(true);
    try {
      const emails: string[] = [];
      
      // Add emails from text input
      if (recipientEmails.trim()) {
        emails.push(...recipientEmails.split(',').map(e => e.trim()).filter(e => e));
      }
      
      // Add emails from selected users
      selectedUsers.forEach(userId => {
        const user = allUsers.find(u => u.id === userId);
        if (user && !emails.includes(user.email)) {
          emails.push(user.email);
        }
      });
      
      if (emails.length === 0) {
        alert('Please enter at least one recipient email');
        return;
      }
      
      await api.post(`/documents/${selectedDocument.id}/assign`, {
        recipient_emails: emails,
        due_date: dueDate || null,
      });

      setShowAssignModal(false);
      setSelectedDocument(null);
      setRecipientEmails('');
      setSelectedUsers([]);
      setDueDate('');
      loadDocuments();
      loadStats();
      loadActivity();
      if (user?.role === 'management') {
        loadWaitingConfirmation();
      } else {
        loadAssignedToSign();
      }
      alert('Document assigned successfully!');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Assignment failed');
    } finally {
      setAssigning(false);
    }
  };

  const handleUserToggle = (userId: number) => {
    setSelectedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const getFilteredDocuments = () => {
    if (user?.role === 'management') {
      return documents;
    }
    
    // For recipients, filter assigned documents
    const docsToFilter = documents;
    switch (filter) {
      case 'pending':
        return docsToFilter.filter(d => d.recipient_status === 'pending');
      case 'draft':
        return docsToFilter.filter(d => d.recipient_status === 'draft');
      case 'signed':
        return docsToFilter.filter(d => d.recipient_status === 'signed');
      default:
        return docsToFilter;
    }
  };

  const getAllDocumentsForRecipient = () => {
    // For recipients, show assigned documents
    if (user?.role !== 'management') {
      return getFilteredDocuments();
    }
    // For management, show their own documents
    return documents;
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'signed':
        return '✓';
      case 'assigned':
        return '✈';
      case 'uploaded':
        return '📄';
      default:
        return '•';
    }
  };

  const getActivityColor = (action: string) => {
    switch (action) {
      case 'signed':
        return 'text-green-600';
      case 'assigned':
        return 'text-blue-600';
      case 'uploaded':
        return 'text-purple-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-2xl font-bold text-blue-600">EasySign</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/profile')}
                className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
              >
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                  {user?.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <div className="font-medium">{user?.full_name}</div>
                  <div className="text-xs text-gray-500 capitalize">{user?.role}</div>
                </div>
              </button>
              <button
                onClick={logout}
                className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          {/* Welcome Section */}
          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900">
              Welcome back, {user?.full_name.split(' ')[0]}.
            </h2>
            <p className="mt-2 text-gray-600">
              {user?.role === 'management' 
                ? 'Manage your documents and track signatures efficiently.'
                : 'Review and sign documents assigned to you.'}
            </p>
          </div>

          {/* Stats Cards - Management */}
          {user?.role === 'management' && (
            <div className={`grid grid-cols-1 md:grid-cols-2 ${(stats.waitingConfirmation && stats.waitingConfirmation > 0) || (assignedToSign.length > 0) || (stats.sentForSigning && stats.sentForSigning > 0) || (stats.sentBackForSigning && stats.sentBackForSigning > 0) ? 'lg:grid-cols-7' : 'lg:grid-cols-4'} gap-6 mb-8`}>
              {stats.sentForSigning !== undefined && stats.sentForSigning > 0 && (
                <div className="bg-white rounded-lg shadow p-6 border-2 border-indigo-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Sent for Signing</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {stats.sentForSigning || 0}
                      </p>
                      <p className="text-sm text-indigo-600 mt-1">Awaiting signatures</p>
                    </div>
                    <div className="text-indigo-600 text-4xl">📤</div>
                  </div>
                </div>
              )}
              {assignedToSign.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6 border-2 border-orange-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Assigned to Sign</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {assignedToSign.length}
                      </p>
                      <p className="text-sm text-orange-600 mt-1">Pending action</p>
                    </div>
                    <div className="text-orange-600 text-4xl">✍️</div>
                  </div>
                </div>
              )}
              {stats.waitingConfirmation !== undefined && stats.waitingConfirmation > 0 && (
                <div className="bg-white rounded-lg shadow p-6 border-2 border-blue-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Waiting for Confirmation</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {stats.waitingConfirmation || 0}
                      </p>
                      <p className="text-sm text-blue-600 mt-1">Needs Review</p>
                    </div>
                    <div className="text-blue-600 text-4xl">⏳</div>
                  </div>
                </div>
              )}
              {stats.sentBackForSigning !== undefined && stats.sentBackForSigning > 0 && (
                <div className="bg-white rounded-lg shadow p-6 border-2 border-red-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">Sent Back for Signing</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">
                        {stats.sentBackForSigning || 0}
                      </p>
                      <p className="text-sm text-red-600 mt-1">Needs Revision</p>
                    </div>
                    <div className="text-red-600 text-4xl">🔄</div>
                  </div>
                </div>
              )}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Documents</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.totalDocuments || 0}
                    </p>
                    {stats.totalDocumentsTrend !== undefined && stats.totalDocumentsTrend > 0 && (
                      <p className="text-sm text-blue-600 mt-1">
                        +{stats.totalDocumentsTrend}%
                      </p>
                    )}
                  </div>
                  <div className="text-blue-600 text-4xl">📄</div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Pending Signatures</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.pendingSignatures || 0}
                    </p>
                    <p className="text-sm text-orange-600 mt-1">Pending</p>
                  </div>
                  <div className="text-orange-600 text-4xl">⏰</div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Signed Documents</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.signedDocuments || 0}
                    </p>
                    {stats.signedDocumentsTrend !== undefined && stats.signedDocumentsTrend > 0 && (
                      <p className="text-sm text-green-600 mt-1">
                        +{stats.signedDocumentsTrend}%
                      </p>
                    )}
                  </div>
                  <div className="text-green-600 text-4xl">✓</div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Draft Documents</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">
                      {stats.draftDocuments || 0}
                    </p>
                    <p className="text-sm text-purple-600 mt-1">Draft</p>
                  </div>
                  <div className="text-purple-600 text-4xl">✏️</div>
                </div>
              </div>
            </div>
          )}

          {/* Assigned to Sign Card - For All Users (including management who can be assigned) */}
          {assignedToSign.length > 0 && (
            <div className="bg-white rounded-lg shadow mb-6 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Assigned to Sign</h3>
                <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                  {assignedToSign.length} {assignedToSign.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              <div className="space-y-3">
                {assignedToSign.map((doc) => (
                  <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-medium text-gray-900">{doc.title}</h4>
                        <p className="text-sm text-gray-500 mt-1">
                          From {doc.uploaded_by_name}
                          {doc.due_date && ` • Due: ${new Date(doc.due_date).toLocaleDateString()}`}
                        </p>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${
                          doc.recipient_status === 'pending' 
                            ? 'bg-yellow-100 text-yellow-800' :
                            'bg-purple-100 text-purple-800'
                        }`}>
                          {doc.recipient_status}
                        </span>
                      </div>
                      <button
                        onClick={() => navigate(`/documents/${doc.id}/sign`)}
                        className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Sign Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sent Back to Me to Sign Again Card - For Recipients */}
          {user?.role !== 'management' && (
            <div className="bg-white rounded-lg shadow mb-6 p-6 border-2 border-red-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Sent Back to Me to Sign Again</h3>
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                  {sentBackForSigning.length} {sentBackForSigning.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              {sentBackForSigning.length > 0 ? (
                <div className="space-y-3">
                  {sentBackForSigning.map((doc: any) => (
                    <div key={doc.id} className="border border-red-200 rounded-lg p-4 hover:bg-red-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-medium text-gray-900">{doc.title}</h4>
                          <p className="text-sm text-gray-500 mt-1">
                            From {doc.sender_name} ({doc.sender_email})
                            {doc.sent_back_at && ` • ${formatDistanceToNow(new Date(doc.sent_back_at), { addSuffix: true })}`}
                          </p>
                          {doc.revision_note && (
                            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                              <p className="text-xs font-semibold text-yellow-800 mb-1">Revision Note:</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.revision_note}</p>
                            </div>
                          )}
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 bg-red-100 text-red-800">
                            Sent Back for Signing
                          </span>
                        </div>
                        <button
                          onClick={() => navigate(`/documents/${doc.id}/sign`)}
                          className="ml-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Sign Again
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No documents sent back for signing</p>
                </div>
              )}
            </div>
          )}

          {/* Sent Back to Me to Sign Again Card - For Management (as recipients) */}
          {user?.role === 'management' && (
            <div className="bg-white rounded-lg shadow mb-6 p-6 border-2 border-red-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Sent Back to Me to Sign Again</h3>
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                  {sentBackToMe.length} {sentBackToMe.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              {sentBackToMe.length > 0 ? (
                <div className="space-y-3">
                  {sentBackToMe.map((doc: any) => (
                    <div key={doc.id} className="border border-red-200 rounded-lg p-4 hover:bg-red-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-medium text-gray-900">{doc.title}</h4>
                          <p className="text-sm text-gray-500 mt-1">
                            From {doc.sender_name} ({doc.sender_email})
                            {doc.sent_back_at && ` • ${formatDistanceToNow(new Date(doc.sent_back_at), { addSuffix: true })}`}
                          </p>
                          {doc.revision_note && (
                            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                              <p className="text-xs font-semibold text-yellow-800 mb-1">Revision Note:</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.revision_note}</p>
                            </div>
                          )}
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 bg-red-100 text-red-800">
                            Sent Back for Signing
                          </span>
                        </div>
                        <button
                          onClick={() => navigate(`/documents/${doc.id}/sign`)}
                          className="ml-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Sign Again
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No documents sent back for signing</p>
                </div>
              )}
            </div>
          )}

          {/* Sent Back for Signing Card - For Management (documents they sent back) */}
          {user?.role === 'management' && (
            <div className="bg-white rounded-lg shadow mb-6 p-6 border-2 border-red-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Sent Back for Signing</h3>
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                  {sentBackForSigning.length} {sentBackForSigning.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              {sentBackForSigning.length > 0 ? (
                <div className="space-y-3">
                  {sentBackForSigning.map((doc: any) => (
                    <div key={doc.id} className="border border-red-200 rounded-lg p-4 hover:bg-red-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-medium text-gray-900">{doc.title}</h4>
                          <p className="text-sm text-gray-500 mt-1">
                            Sent back to {doc.recipient_name} ({doc.recipient_email})
                            {doc.sent_back_at && ` • ${formatDistanceToNow(new Date(doc.sent_back_at), { addSuffix: true })}`}
                          </p>
                          {doc.revision_note && (
                            <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                              <p className="text-xs font-semibold text-yellow-800 mb-1">Revision Note:</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">{doc.revision_note}</p>
                            </div>
                          )}
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 bg-red-100 text-red-800">
                            Sent Back for Signing
                          </span>
                        </div>
                        <button
                          onClick={() => navigate(`/documents/${doc.id}/preview`)}
                          className="ml-4 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No documents sent back for signing</p>
                </div>
              )}
            </div>
          )}

          {/* Waiting for Confirmation Card - For Management */}
          {user?.role === 'management' && waitingConfirmation.length > 0 && (
            <div className="bg-white rounded-lg shadow mb-6 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">Signed - Waiting for Confirmation</h3>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {waitingConfirmation.length} {waitingConfirmation.length === 1 ? 'document' : 'documents'}
                </span>
              </div>
              <div className="space-y-3">
                {waitingConfirmation.map((doc: any) => (
                  <div key={doc.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="text-lg font-medium text-gray-900">{doc.title}</h4>
                        <p className="text-sm text-gray-500 mt-1">
                          Signed by {doc.signer_name} ({doc.signer_email})
                          {doc.signed_at && ` • ${formatDistanceToNow(new Date(doc.signed_at), { addSuffix: true })}`}
                        </p>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 bg-blue-100 text-blue-800">
                          Waiting for Confirmation
                        </span>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => navigate(`/documents/${doc.id}/preview`)}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleConfirm(doc.id)}
                          disabled={confirming === doc.id}
                          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                        >
                          {confirming === doc.id ? 'Confirming...' : 'Confirm'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Button */}
          {user?.role === 'management' && (
            <div className="mb-8">
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <span>☁️</span>
                <span>Upload New Document</span>
              </button>
            </div>
          )}

          {/* Recent Activity - Management */}
          {user?.role === 'management' && activities.length > 0 && (
            <div className="bg-white rounded-lg shadow mb-8 p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Recent Activity</h3>
              <div className="space-y-4">
                {activities.map((activity, idx) => (
                  <div key={idx} className="flex items-center justify-between py-3 border-b border-gray-200 last:border-0">
                    <div className="flex items-center space-x-4">
                      <div className={`text-2xl ${getActivityColor(activity.action)}`}>
                        {getActivityIcon(activity.action)}
                      </div>
                      <div>
                        <p className="text-gray-900">
                          {activity.action === 'signed' && (
                            <>{activity.recipient_name} signed "{activity.document_title}"</>
                          )}
                          {activity.action === 'assigned' && (
                            <>Document "{activity.document_title}" sent to {activity.recipient_name}</>
                          )}
                          {activity.action === 'uploaded' && (
                            <>New document uploaded: "{activity.document_title}"</>
                          )}
                        </p>
                        <p className="text-sm text-gray-500">
                          {activity.recipient_email && `${activity.recipient_email} • `}
                          {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      activity.action === 'signed' ? 'bg-green-100 text-green-800' :
                      activity.action === 'assigned' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {activity.action === 'signed' ? 'Completed' : 
                       activity.action === 'assigned' ? 'Pending' : 'Draft'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Documents Section */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-900">
                  {user?.role === 'management' ? 'Your Documents' : 'Your Documents'}
                </h3>
                {user?.role === 'recipient' && (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setFilter('all')}
                      className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                    >
                      All Documents
                    </button>
                    <button
                      onClick={() => setFilter('pending')}
                      className={`px-4 py-2 rounded ${filter === 'pending' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                    >
                      Pending ({stats.pendingDocuments || 0})
                    </button>
                    <button
                      onClick={() => setFilter('draft')}
                      className={`px-4 py-2 rounded ${filter === 'draft' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                    >
                      Draft ({stats.draftDocuments || 0})
                    </button>
                    <button
                      onClick={() => setFilter('signed')}
                      className={`px-4 py-2 rounded ${filter === 'signed' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
                    >
                      Signed ({stats.signedDocuments || 0})
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {getAllDocumentsForRecipient().length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-500">
                  {user?.role === 'management' ? 'No documents uploaded yet' : 'No documents assigned to you'}
                </div>
              ) : (
                getAllDocumentsForRecipient().map((doc) => (
                  <div key={doc.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50">
                    <div className="flex-1">
                      <h4 className="text-lg font-medium text-gray-900">{doc.title}</h4>
                      <p className="text-sm text-gray-500 mt-1">
                        {user?.role === 'management' 
                          ? `Uploaded by ${doc.uploaded_by_name}` 
                          : `From ${doc.uploaded_by_name}`}
                        {doc.due_date && ` • Due: ${new Date(doc.due_date).toLocaleDateString()}`}
                      </p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${
                        doc.recipient_status === 'signed' || doc.status === 'signed' 
                          ? 'bg-green-100 text-green-800' :
                        doc.recipient_status === 'pending' || doc.status === 'pending' 
                          ? 'bg-yellow-100 text-yellow-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {doc.recipient_status || doc.status}
                      </span>
                    </div>
                    <div className="flex space-x-2">
                      {user?.role === 'management' ? (
                        <>
                          <button
                            onClick={() => {
                              setSelectedDocument(doc);
                              setShowAssignModal(true);
                              loadUsers();
                            }}
                            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Assign
                          </button>
                          <button
                            onClick={() => navigate(`/documents/${doc.id}`)}
                            className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                          >
                            View
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => navigate(`/documents/${doc.id}/sign`)}
                          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          {doc.recipient_status === 'signed' ? 'View' : 'Sign'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <h3 className="text-lg font-bold mb-4">Upload Document</h3>
            <form onSubmit={handleUpload}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Document title"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File (PDF or Word)
                </label>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadTitle('');
                    setUploadFile(null);
                  }}
                  className="px-4 py-2 text-sm bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || !uploadFile}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedDocument && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Assign Document</h3>
            <p className="text-sm text-gray-600 mb-4">{selectedDocument.title}</p>
            <form onSubmit={handleAssign}>
              {/* Existing Users Section */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Existing Users
                </label>
                {loadingUsers ? (
                  <div className="text-sm text-gray-500">Loading users...</div>
                ) : (
                  <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
                    {allUsers.length === 0 ? (
                      <p className="text-sm text-gray-500">No users found</p>
                    ) : (
                      <div className="space-y-2">
                        {allUsers.map((user) => (
                          <label
                            key={user.id}
                            className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedUsers.includes(user.id)}
                              onChange={() => handleUserToggle(user.id)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{user.full_name}</div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                              <div className="text-xs text-gray-400 capitalize">{user.role}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {selectedUsers.length > 0 && (
                  <p className="text-xs text-blue-600 mt-2">
                    {selectedUsers.length} user(s) selected
                  </p>
                )}
              </div>

              {/* Divider */}
              <div className="mb-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">OR</span>
                  </div>
                </div>
              </div>

              {/* Email Input Section */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter New Recipient Email(s)
                </label>
                <textarea
                  value={recipientEmails}
                  onChange={(e) => setRecipientEmails(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Enter email addresses separated by commas (for users without accounts)"
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Separate multiple emails with commas. New accounts will be created automatically.
                </p>
              </div>

              {/* Due Date */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Due Date (Optional)
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAssignModal(false);
                    setSelectedDocument(null);
                    setRecipientEmails('');
                    setSelectedUsers([]);
                    setDueDate('');
                  }}
                  className="px-4 py-2 text-sm bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning || (recipientEmails.trim() === '' && selectedUsers.length === 0)}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {assigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
