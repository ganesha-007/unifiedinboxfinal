import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { channelsService, Account, Chat, Message } from '../services/channels.service';
import { gmailService } from '../services/gmail.service';
import { outlookService } from '../services/outlook.service';
import SendMeter from '../components/SendMeter';
import './InboxPage.css';

const InboxPage: React.FC = () => {
  const { user, logout, socket } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<{[chatId: string]: number}>({});
  const [selectedProvider, setSelectedProvider] = useState<'whatsapp' | 'instagram' | 'email' | 'outlook'>(
    (searchParams.get('provider') as 'whatsapp' | 'instagram' | 'email' | 'outlook') || 'whatsapp'
  );
  const [showRawHtml, setShowRawHtml] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Attachment handling functions
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const newFiles = Array.from(files);
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Define all functions first
  const loadAccounts = useCallback(async () => {
    try {
      console.log('🔄 Loading accounts for provider:', selectedProvider);
      setLoading(true);
      // Clear current selections when switching providers
      setSelectedAccount(null);
      setSelectedChat(null);
      setChats([]);
      setMessages([]);
      
      let data;
      if (selectedProvider === 'email') {
        data = await gmailService.getAccounts();
      } else if (selectedProvider === 'outlook') {
        data = await outlookService.getAccounts();
      } else {
        data = await channelsService.getAccounts(selectedProvider);
      }
      console.log('📋 Accounts loaded:', data);
      setAccounts(data);
      if (data.length > 0) {
        setSelectedAccount(data[0]);
        console.log('✅ Selected account:', data[0]);
      }
    } catch (error: any) {
      console.error('Failed to load accounts:', error);
      
      // Handle Outlook authentication errors specifically
      if (selectedProvider === 'outlook' && error.response?.status === 401) {
        console.log('🔄 Outlook authentication required - user needs to reconnect');
        // Set empty accounts array so the UI can show connection prompt
        setAccounts([]);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedProvider]);

  const loadChats = useCallback(async (accountId: string) => {
    try {
      console.log('💬 Loading chats for provider:', selectedProvider, 'account:', accountId);
      let data;
      if (selectedProvider === 'email') {
        data = await gmailService.getChats(accountId);
      } else if (selectedProvider === 'outlook') {
        data = await outlookService.getChats(accountId);
      } else {
        data = await channelsService.getChats(selectedProvider, accountId);
      }
      console.log('💬 Chats loaded:', data);
      setChats(data);
      if (data.length > 0 && !selectedChat) {
        setSelectedChat(data[0]);
        console.log('✅ Selected chat:', data[0]);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  }, [selectedChat, selectedProvider]);

  const calculateUnreadCounts = useCallback((currentMessages: Message[], currentChatProviderId: string) => {
    // Only update unread counts for the current chat being viewed
    // Don't reset existing unread counts for other chats
    setUnreadCounts(prev => {
      const newCounts = { ...prev };
      
      // Find the chat by provider_chat_id and clear its unread count
      if (currentChatProviderId) {
        const chat = chats.find(c => c.provider_chat_id === currentChatProviderId);
        if (chat) {
          delete newCounts[chat.id.toString()];
        }
      }
      
      return newCounts;
    });
  }, [chats]);

  const loadMessages = useCallback(async (accountId: string, chatId: string) => {
    try {
      console.log('📥 Loading messages for:', { accountId, chatId, provider: selectedProvider });
      let data;
      if (selectedProvider === 'email') {
        data = await gmailService.getMessages(accountId, chatId);
      } else if (selectedProvider === 'outlook') {
        data = await outlookService.getMessages(accountId, chatId);
      } else {
        data = await channelsService.getMessages(selectedProvider, accountId, chatId);
      }
      console.log('📥 Messages loaded:', data.length, 'messages');
      // Sort ascending so newest appears at the bottom (Gmail-like)
      const sorted = [...data].sort((a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());
      setMessages(sorted);
      
      // Clear unread count for the currently viewed chat
      calculateUnreadCounts(data, chatId);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }, [calculateUnreadCounts, selectedProvider]);

  const clearUnreadCount = useCallback((chatId: string) => {
    setUnreadCounts(prev => {
      const newCounts = { ...prev };
      delete newCounts[chatId];
      return newCounts;
    });
  }, []);

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedAccount || !selectedChat) return;

    const messageText = messageInput.trim();
    setSending(true);
    
    // Clear input after validation but before sending
    setMessageInput('');

    try {
      console.log('📤 Sending message:', {
        provider: selectedProvider,
        accountId: selectedAccount.id,
        chatId: selectedChat.provider_chat_id,
        messageText,
        hasAttachments: attachments.length > 0
      });
      
      if (selectedProvider === 'email') {
        // For Gmail, determine the correct recipient for the reply
        // We need to find who to reply to based on the thread participants
        let replyTo = '';
        
        if (messages.length > 0) {
          // Get all unique participants from the thread
          const participants = new Set<string>();
          messages.forEach((msg: any) => {
            if (msg.metadata?.from) {
              const from = msg.metadata.from;
              if (typeof from === 'object' && from?.address) {
                participants.add(from.address);
              } else if (typeof from === 'string') {
                participants.add(from);
              }
            }
            if (msg.metadata?.to) {
              const to = msg.metadata.to;
              if (Array.isArray(to)) {
                to.forEach(t => {
                  if (typeof t === 'object' && t?.address) {
                    participants.add(t.address);
                  } else if (typeof t === 'string') {
                    participants.add(t);
                  }
                });
              } else if (typeof to === 'object' && to?.address) {
                participants.add(to.address);
              } else if (typeof to === 'string') {
                participants.add(to);
              }
            }
          });
          
          // Find the participant who is not the current user
          const currentUserEmail = (selectedAccount as any).email || '';
          const participantsArray = Array.from(participants);
          for (const participant of participantsArray) {
            if (participant !== currentUserEmail && !participant.includes(currentUserEmail)) {
              replyTo = participant;
              break;
            }
          }
        }
        
        // Fallback to the original sender if we can't determine the correct recipient
        if (!replyTo) {
          const from = selectedChat.metadata?.from;
          if (typeof from === 'object' && from?.address) {
            replyTo = from.address;
          } else if (typeof from === 'string') {
            replyTo = from;
          } else {
            replyTo = '';
          }
        }

        // Convert attachments to base64
        const attachmentData = [];
        if (attachments.length > 0) {
          console.log('📎 Frontend: Converting attachments to base64:', attachments.length);
          for (const file of attachments) {
            console.log('📎 Frontend: Processing file:', file.name, file.type, file.size);
            const base64Data = await convertFileToBase64(file);
            console.log('📎 Frontend: Base64 data length:', base64Data.length);
            attachmentData.push({
              name: file.name,
              type: file.type,
              data: base64Data
            });
          }
        }
        console.log('📎 Frontend: Final attachment data:', attachmentData.length);

        console.log('📧 Frontend: Sending message with:', {
          body: messageText,
          bodyLength: messageText.length,
          subject: selectedChat.title || 'No Subject',
          to: replyTo,
          attachmentsCount: attachmentData.length
        });

        await gmailService.sendMessage(
          selectedAccount.id as string,
          selectedChat.provider_chat_id,
          {
            body: messageText,
            subject: selectedChat.title || 'No Subject',
            to: replyTo,
            attachments: attachmentData
          }
        );
        
        // Clear attachments after sending
        setAttachments([]);
      } else if (selectedProvider === 'outlook') {
        console.log('📧 Processing Outlook message send...');
        // For Outlook, determine the correct recipient for the reply
        let replyTo = '';
        
        // Email validation regex
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        
        if (messages.length > 0) {
          // Get all unique participants from the thread
          const participants = new Set<string>();
          messages.forEach((msg: any) => {
            // Extract from field
            if (msg.metadata?.from) {
              const from = msg.metadata.from;
              if (typeof from === 'object' && from?.address && emailRegex.test(from.address)) {
                participants.add(from.address);
              } else if (typeof from === 'string' && emailRegex.test(from)) {
                participants.add(from);
              }
            }
            
            // Extract toRecipients field
            if (msg.metadata?.toRecipients && Array.isArray(msg.metadata.toRecipients)) {
              msg.metadata.toRecipients.forEach((recipient: any) => {
                if (recipient?.address && emailRegex.test(recipient.address)) {
                  participants.add(recipient.address);
                } else if (typeof recipient === 'string' && emailRegex.test(recipient)) {
                  participants.add(recipient);
                }
              });
            }
            
            // Extract ccRecipients field
            if (msg.metadata?.ccRecipients && Array.isArray(msg.metadata.ccRecipients)) {
              msg.metadata.ccRecipients.forEach((recipient: any) => {
                if (recipient?.address && emailRegex.test(recipient.address)) {
                  participants.add(recipient.address);
                } else if (typeof recipient === 'string' && emailRegex.test(recipient)) {
                  participants.add(recipient);
                }
              });
            }
            
            // Also check sender_id if it's a valid email
            if (msg.sender_id && emailRegex.test(msg.sender_id)) {
              participants.add(msg.sender_id);
            }
          });
          
          // Find the participant who is not the current user
          const currentUserEmail = (selectedAccount as any).email || '';
          const participantsArray = Array.from(participants);
          console.log('📧 All conversation participants:', participantsArray);
          console.log('📧 Current user email:', currentUserEmail);
          
          for (const participant of participantsArray) {
            if (participant !== currentUserEmail && !participant.includes(currentUserEmail) && emailRegex.test(participant)) {
              replyTo = participant;
              break;
            }
          }
        }
        
        // If still no valid recipient, let the backend handle recipient determination
        if (!replyTo || !emailRegex.test(replyTo)) {
          console.log('⚠️ No valid recipient found in frontend, letting backend determine recipients');
          replyTo = ''; // Let backend handle recipient determination
        }
        
        console.log('📧 Outlook replyTo determined:', replyTo);
        
        // Convert attachments to base64
        const attachmentData = [];
        if (attachments.length > 0) {
          console.log('📎 Frontend: Converting attachments to base64:', attachments.length);
          for (const file of attachments) {
            console.log('📎 Frontend: Processing file:', file.name, file.type, file.size);
            const base64Data = await convertFileToBase64(file);
            console.log('📎 Frontend: Base64 data length:', base64Data.length);
            attachmentData.push({
              name: file.name,
              type: file.type,
              data: base64Data
            });
          }
        }

        console.log('📧 Calling outlookService.sendMessage with:', {
          accountId: selectedAccount.id,
          chatId: selectedChat.provider_chat_id,
          body: messageText,
          subject: selectedChat.title || 'No Subject',
          to: replyTo,
          attachments: attachmentData.length
        });

        const outlookMessageData: any = {
          body: messageText,
          subject: selectedChat.title || 'No Subject',
          attachments: attachmentData
        };
        
        // Only include 'to' field if we have a valid recipient
        if (replyTo) {
          outlookMessageData.to = replyTo;
        }

        await outlookService.sendMessage(
          selectedAccount.id as string,
          selectedChat.provider_chat_id,
          outlookMessageData
        );
        
        // Clear attachments after sending
        setAttachments([]);
      } else {
        await channelsService.sendMessage(
          selectedProvider,
          selectedAccount.id as string,
          selectedChat.provider_chat_id,
          messageText
        );
      }

      // Reload messages to get the latest
      console.log('🔄 Reloading messages after send...');
      await loadMessages(
        selectedAccount.id as string,
        selectedChat.provider_chat_id
      );
      console.log('✅ Messages reloaded');
    } catch (error: any) {
      console.error('Failed to send message:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Show user-friendly error message
      const errorMessage = error.response?.data?.error || 
                          error.response?.data?.message || 
                          error.message || 
                          'Failed to send message. Please try again.';
      
      alert(`Error sending message: ${errorMessage}`);
      setMessageInput(messageText); // Restore message on error
    } finally {
      setSending(false);
    }
  };

  const handleNewMessage = useCallback((data: any) => {
    // Update unread count for the chat that received the message
    if (data.chatId && data.message && data.message.direction === 'in') {
      // Find the chat ID from the provider_chat_id
      const chat = chats.find(c => c.provider_chat_id === data.chatId);
      if (chat) {
        setUnreadCounts(prev => ({
          ...prev,
          [chat.id.toString()]: (prev[chat.id.toString()] || 0) + 1
        }));
      }
    }
    
    // Reload messages if it's for the current chat
    if (selectedChat && selectedAccount) {
      loadMessages(
        selectedAccount.id as string,
        selectedChat.provider_chat_id
      );
    }
    // Reload chats to update last message time
    if (selectedAccount) {
      loadChats(selectedAccount.id as string);
    }
  }, [selectedChat, selectedAccount, loadMessages, loadChats, chats]);

  const handleMessageSent = useCallback((data: any) => {
    console.log('Message sent confirmation:', data);
    if (selectedChat && selectedAccount) {
      loadMessages(
        selectedAccount.id as string,
        selectedChat.provider_chat_id
      );
    }
  }, [selectedChat, selectedAccount, loadMessages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);

    if (hours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const formatLastMessageTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    const days = diff / (1000 * 60 * 60 * 24);

    if (hours < 1) {
      return 'now';
    } else if (hours < 24) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true
      });
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getChatAvatar = (chat: Chat) => {
    const name = chat.title || 'Unknown';
    return (
      <div className="chat-avatar">
        {getInitials(name)}
      </div>
    );
  };

  // Function to safely render HTML content
  const renderEmailBody = (body: string) => {
    if (!body) return 'No content';
    
    // Check if the body contains HTML tags
    const hasHtmlTags = /<[^>]*>/g.test(body);
    
    if (!hasHtmlTags || showRawHtml) {
      // Display as plain text
      return (
        <div className="email-body-text" style={{ whiteSpace: 'pre-wrap' }}>
          {body}
        </div>
      );
    }
    
    // Display as HTML (safely)
    return (
      <div 
        className="email-body-html"
        dangerouslySetInnerHTML={{ __html: body }}
        style={{
          maxWidth: '100%',
          overflow: 'hidden',
          wordWrap: 'break-word'
        }}
      />
    );
  };

  const filteredChats = chats.filter(chat => 
    chat.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // useEffects after all functions are defined
  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Setup socket connection and join user room
  useEffect(() => {
    if (socket && user) {
      // Join user's socket room for real-time updates
      socket.emit('join-user', user.id);
      
      // Listen for new messages
      socket.on('new_message', handleNewMessage);
      socket.on('message:sent', handleMessageSent);
      
      // Rejoin room on reconnection
      socket.on('connect', () => {
        socket.emit('join-user', user.id);
      });
      
      return () => {
        socket.off('new_message', handleNewMessage);
        socket.off('message:sent', handleMessageSent);
        socket.off('connect');
      };
    }
  }, [socket, user, handleNewMessage, handleMessageSent]);

  useEffect(() => {
    if (selectedAccount) {
      loadChats(selectedAccount.id as string);
    }
  }, [selectedAccount, loadChats]);

  useEffect(() => {
    if (selectedChat && selectedAccount) {
      loadMessages(
        selectedAccount.id as string,
        selectedChat.provider_chat_id
      );
      
      // Join chat room for real-time updates
      if (socket) {
        socket.emit('join-chat', selectedChat.provider_chat_id);
      }
    }
  }, [selectedChat, selectedAccount, socket, loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  if (loading) {
    return (
      <div className="inbox-loading-container">
        <div className="inbox-loading-content">
          <div className="inbox-loading-spinner"></div>
          <div className="inbox-loading-text">Loading...</div>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    const getEmptyStateContent = () => {
      switch (selectedProvider) {
        case 'whatsapp':
          return {
            icon: '📱',
            title: 'No WhatsApp accounts connected',
            description: 'Connect your WhatsApp account to start messaging',
            buttonText: 'Connect WhatsApp'
          };
        case 'instagram':
          return {
            icon: '📷',
            title: 'No Instagram accounts connected',
            description: 'Connect your Instagram account to start messaging',
            buttonText: 'Connect Instagram'
          };
        case 'email':
          return {
            icon: '📧',
            title: 'No Gmail accounts connected',
            description: 'Connect your Gmail account to start messaging',
            buttonText: 'Connect Gmail'
          };
        case 'outlook':
          return {
            icon: '📧',
            title: 'No Outlook accounts connected',
            description: 'Connect your Outlook account to start messaging',
            buttonText: 'Connect Outlook'
          };
        default:
          return {
            icon: '📱',
            title: 'No accounts connected',
            description: 'Connect an account to start messaging',
            buttonText: 'Connect Account'
          };
      }
    };

    const emptyState = getEmptyStateContent();

    return (
      <div className="whatsapp-app">
        <div className="empty-state">
          <div className="empty-icon">{emptyState.icon}</div>
          <h2>{emptyState.title}</h2>
          <p>{emptyState.description}</p>
          <button onClick={() => navigate('/connections')} className="btn-connect">
            {emptyState.buttonText}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="whatsapp-app">
      {/* Left Sidebar - Chat List */}
      <div className="sidebar">
        {/* Sidebar Header */}
        <div className="sidebar-header">
          <div className="header-top">
            <div className="profile-section">
              <div className="profile-avatar">
                {getInitials(user?.email || 'User')}
              </div>
              <div className="profile-info">
                <h3>WhatsApp</h3>
                <p>Web</p>
              </div>
            </div>
            <div className="header-actions">
              <button 
                className="icon-btn" 
                title="Analytics"
                onClick={() => navigate('/analytics')}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 13h2v8H3v-8zm4-6h2v14H7V7zm4-6h2v20h-2V1zm4 4h2v16h-2V5zm4 2h2v14h-2V7z"/>
                </svg>
              </button>
              <button className="icon-btn" title="Status">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <circle cx="12" cy="12" r="3" fill="currentColor"/>
                </svg>
              </button>
              <button className="icon-btn" title="New Chat">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                </svg>
              </button>
              <button className="icon-btn" title="Menu">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Provider Tabs */}
          <div className="provider-tabs">
            <button
              className={`provider-tab ${selectedProvider === 'whatsapp' ? 'active' : ''}`}
              onClick={() => {
                console.log('🔄 Switching to WhatsApp tab');
                setSelectedProvider('whatsapp');
              }}
            >
              📱 WhatsApp
            </button>
            <button
              className={`provider-tab ${selectedProvider === 'instagram' ? 'active' : ''}`}
              onClick={() => {
                console.log('🔄 Switching to Instagram tab');
                setSelectedProvider('instagram');
              }}
            >
              📸 Instagram
            </button>
            <button
              className={`provider-tab ${selectedProvider === 'email' ? 'active' : ''}`}
              onClick={() => {
                console.log('🔄 Switching to Email tab');
                setSelectedProvider('email');
              }}
            >
              📧 Email
            </button>
            <button
              className={`provider-tab ${selectedProvider === 'outlook' ? 'active' : ''}`}
              onClick={() => {
                console.log('🔄 Switching to Outlook tab');
                setSelectedProvider('outlook');
              }}
            >
              📧 Outlook
            </button>
          </div>
          
          {/* Search Bar */}
          <div className="search-container">
            <div className="search-box">
              <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
              </svg>
              <input
                type="text"
                placeholder="Search or start new chat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
          </div>
        </div>

        {/* Navigation Icons */}
        <div className="nav-icons">
          <button className="nav-icon active" title="Chats">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h4l4 4 4-4h4c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
            {Object.values(unreadCounts).reduce((sum, count) => sum + count, 0) > 0 && (
              <span className="unread-badge">
                {Object.values(unreadCounts).reduce((sum, count) => sum + count, 0)}
              </span>
            )}
          </button>
          <button className="nav-icon" title="Status">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
            </svg>
          </button>
          <button className="nav-icon" title="Channels">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
          </button>
        </div>

        {/* Chat List */}
        <div className="chat-list">
          {filteredChats.length === 0 ? (
            <div className="empty-chats">
              {searchQuery ? 'No chats found' : 'No conversations yet'}
            </div>
          ) : (
            filteredChats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item ${selectedChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedChat(chat);
                  clearUnreadCount(chat.id.toString());
                }}
              >
                {getChatAvatar(chat)}
                <div className="chat-info">
                  <div className="chat-header">
                    <div className="chat-name">{chat.title || 'Unknown'}</div>
                    <div className="chat-time">
                      {chat.last_message_at
                        ? formatLastMessageTime(chat.last_message_at)
                        : ''}
                    </div>
                  </div>
                  <div className="chat-preview">
                    <span className="last-message">
                      {messages.find(m => m.chat_id === chat.id)?.body || 'No messages yet'}
                    </span>
                    <div className="chat-status">
                      {unreadCounts[chat.id.toString()] ? (
                        <span className="unread-badge">{unreadCounts[chat.id.toString()]}</span>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="main-chat">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="chat-header">
              <div className="chat-header-info">
                {getChatAvatar(selectedChat)}
                <div className="chat-details">
                  <h3>{selectedChat.title || 'Conversation'}</h3>
                  <p>Click here for contact info</p>
                </div>
              </div>
              <div className="chat-header-actions">
                <button className="icon-btn" title="Video call">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  </svg>
                </button>
                <button className="icon-btn" title="Voice call">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                  </svg>
                </button>
                <button className="icon-btn" title="Search">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                  </svg>
                </button>
                <button className="icon-btn" title="Menu">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* Send Meter for Email Accounts */}
            {selectedProvider === 'email' && selectedAccount && (
              <SendMeter 
                accountId={selectedAccount.id as string}
                className="email-send-meter"
              />
            )}

            {/* Messages Area */}
            <div className="messages-container">
              {selectedProvider === 'email' ? (
                <div className="email-thread">
                  {messages.map((message) => (
                    <div key={message.id} className="email-card">
                      <div className="email-card-header">
                        <div className="email-from">
                          {(() => {
                            const from = (message as any).metadata?.from;
                            if (typeof from === 'object' && from?.name) {
                              return from.name;
                            } else if (typeof from === 'object' && from?.address) {
                              return from.address;
                            } else if (typeof from === 'string') {
                              return from;
                            }
                            return 'Unknown sender';
                          })()}
                        </div>
                        <div className="email-date">{formatTime(message.sent_at)}</div>
                      </div>
                      <div className="email-subject">{(message as any).metadata?.subject || selectedChat.title || 'No Subject'}</div>
                      {(message as any).metadata?.to && (
                        <div className="email-to">
                          To: {(() => {
                            const to = (message as any).metadata?.to;
                            if (Array.isArray(to)) {
                              return to.map(t => typeof t === 'object' ? (t.name || t.address) : t).join(', ');
                            } else if (typeof to === 'object' && to?.name) {
                              return to.name;
                            } else if (typeof to === 'object' && to?.address) {
                              return to.address;
                            } else if (typeof to === 'string') {
                              return to;
                            }
                            return 'Unknown recipient';
                          })()}
                        </div>
                      )}
                      <div className="email-body-container">
                        <div className="email-body-actions">
                          <button 
                            className="toggle-html-btn"
                            onClick={() => setShowRawHtml(!showRawHtml)}
                            title={showRawHtml ? 'Show formatted view' : 'Show raw HTML'}
                          >
                            {showRawHtml ? '📄 Formatted' : '🔧 Raw HTML'}
                          </button>
                        </div>
                        {renderEmailBody(message.body)}
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              ) : (
                <div className="messages-list">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`message ${message.direction === 'out' ? 'sent' : 'received'}`}
                    >
                      <div className="message-bubble">
                        <div className="message-text">{message.body}</div>
                        <div className="message-meta">
                          <span className="message-time">
                            {formatTime(message.sent_at)}
                          </span>
                          {message.direction === 'out' && (
                            <div className="message-status">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div className="message-input-container">
              {/* Attachments Display */}
              {attachments.length > 0 && (
                <div className="attachments-preview">
                  {attachments.map((file, index) => (
                    <div key={index} className="attachment-item">
                      <span className="attachment-name">{file.name}</span>
                      <span className="attachment-size">({formatFileSize(file.size)})</span>
                      <button 
                        onClick={() => removeAttachment(index)}
                        className="remove-attachment"
                        title="Remove attachment"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="message-input-wrapper">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  style={{ display: 'none' }}
                  accept="*/*"
                />
                <button 
                  className="icon-btn attachment-btn" 
                  title="Attach files"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z"/>
                  </svg>
                </button>
                <div className="message-input-box">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type a message"
                    className="message-input"
                    disabled={sending}
                  />
                </div>
                  <button
                    onClick={handleSendMessage}
                    disabled={sending || (!messageInput.trim() && attachments.length === 0)}
                    className="send-btn"
                    title="Send"
                  >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          selectedProvider === 'email' ? (
            <div className="email-list">
              {chats.length === 0 ? (
                <div className="empty-chats">No emails yet</div>
              ) : (
                chats.map((chat) => (
                  <div
                    key={(chat as any).id}
                    className={`email-row ${(selectedChat as any)?.id === (chat as any).id ? 'active' : ''}`}
                    onClick={() => setSelectedChat(chat as any)}
                  >
                    <div className="email-row-left">
                      <div className="email-avatar">{getInitials((chat as any).title || 'Email')}</div>
                    </div>
                    <div className="email-row-center">
                      <div className="email-row-top">
                        <span className="email-from">
                          {(() => {
                            const from = (chat as any).metadata?.from;
                            if (typeof from === 'object' && from?.name) {
                              return from.name;
                            } else if (typeof from === 'object' && from?.address) {
                              return from.address;
                            } else if (typeof from === 'string') {
                              return from;
                            }
                            return 'Unknown sender';
                          })()}
                        </span>
                        <span className="email-date">{(chat as any).last_message_at ? formatLastMessageTime((chat as any).last_message_at) : ''}</span>
                      </div>
                      <div className="email-row-bottom">
                        <span className="email-subject">{(chat as any).title || 'No Subject'}</span>
                        <span className="email-snippet">{(chat as any).metadata?.snippet || ''}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="no-chat-selected">
              <div className="whatsapp-logo">
                <svg width="200" height="200" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                </svg>
              </div>
              <h2>WhatsApp Web</h2>
              <p>Send and receive messages without keeping your phone online.</p>
              <p>Use WhatsApp on up to 4 linked devices and 1 phone at the same time.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default InboxPage;