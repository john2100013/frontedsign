import { useState, useEffect } from 'react';
import api from '../utils/api';

interface User {
  id: number;
  email: string;
  full_name: string;
  role: string;
}

interface ForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onForward: (selectedUserIds: number[], ccEmails: string[], externalEmails: string[]) => Promise<void>;
  documentTitle: string;
}

export function ForwardModal({ isOpen, onClose, onForward, documentTitle }: ForwardModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [ccEmails, setCcEmails] = useState('');
  const [externalEmails, setExternalEmails] = useState('');
  const [forwarding, setForwarding] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      setError('Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleUserToggle = (userId: number) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleForward = async () => {
    setError('');
    
    // Validate that at least one recipient is selected
    const ccEmailList = ccEmails.split(',').map(email => email.trim()).filter(email => email);
    const externalEmailList = externalEmails.split(',').map(email => email.trim()).filter(email => email);
    
    if (selectedUserIds.length === 0 && externalEmailList.length === 0) {
      setError('Please select at least one user or enter at least one external email address');
      return;
    }

    // Validate email formats
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allEmails = [...ccEmailList, ...externalEmailList];
    const invalidEmails = allEmails.filter(email => !emailRegex.test(email));
    
    if (invalidEmails.length > 0) {
      setError(`Invalid email format: ${invalidEmails.join(', ')}`);
      return;
    }

    setForwarding(true);
    try {
      await onForward(selectedUserIds, ccEmailList, externalEmailList);
      // Reset form
      setSelectedUserIds([]);
      setCcEmails('');
      setExternalEmails('');
      onClose();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Failed to forward document');
    } finally {
      setForwarding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Forward Document</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
              disabled={forwarding}
            >
              ×
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              <strong>Document:</strong> {documentTitle}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Select Users */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Users (who already have accounts):
            </label>
            {loadingUsers ? (
              <div className="text-sm text-gray-500">Loading users...</div>
            ) : (
              <div className="border border-gray-300 rounded p-3 max-h-48 overflow-y-auto">
                {users.length === 0 ? (
                  <div className="text-sm text-gray-500">No users available</div>
                ) : (
                  users.map(user => (
                    <label key={user.id} className="flex items-center space-x-2 py-2 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => handleUserToggle(user.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-gray-900">{user.full_name}</span>
                        <span className="text-xs text-gray-500 ml-2">({user.email})</span>
                        <span className="text-xs text-gray-400 ml-2">- {user.role}</span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>

          {/* CC Emails */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CC (comma-separated emails):
            </label>
            <input
              type="text"
              value={ccEmails}
              onChange={(e) => setCcEmails(e.target.value)}
              placeholder="email1@example.com, email2@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={forwarding}
            />
            <p className="text-xs text-gray-500 mt-1">
              Separate multiple emails with commas
            </p>
          </div>

          {/* External Emails */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              External Recipients (users without accounts, comma-separated emails):
            </label>
            <input
              type="text"
              value={externalEmails}
              onChange={(e) => setExternalEmails(e.target.value)}
              placeholder="external1@example.com, external2@example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={forwarding}
            />
            <p className="text-xs text-gray-500 mt-1">
              These recipients will receive the document via email with attachment
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={forwarding}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleForward}
              disabled={forwarding || (selectedUserIds.length === 0 && !externalEmails.trim())}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {forwarding ? 'Forwarding...' : 'Forward'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

