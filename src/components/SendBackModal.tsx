import { useState } from 'react';

interface SendBackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendBack: (note: string) => Promise<void>;
  documentTitle: string;
  signerName: string;
}

export function SendBackModal({ isOpen, onClose, onSendBack, documentTitle, signerName }: SendBackModalProps) {
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const handleSendBack = async () => {
    setError('');
    
    if (!note.trim()) {
      setError('Please enter a note explaining why the document is being sent back');
      return;
    }

    setSending(true);
    try {
      await onSendBack(note.trim());
      // Reset form
      setNote('');
      onClose();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to send document back');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Send Document Back</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
              disabled={sending}
            >
              ×
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              <strong>Document:</strong> {documentTitle}
            </p>
            <p className="text-sm text-gray-600 mb-2">
              <strong>Will be sent back to:</strong> {signerName}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Note (required):
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Please explain why the document is being sent back for revision..."
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={sending}
            />
            <p className="text-xs text-gray-500 mt-1">
              This note will be included in the email sent to the signer
            </p>
          </div>

          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSendBack}
              disabled={sending || !note.trim()}
              className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
            >
              {sending ? 'Sending...' : 'Send Back'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

