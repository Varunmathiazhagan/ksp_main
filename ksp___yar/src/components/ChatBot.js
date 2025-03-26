import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaRobot, FaComments, FaTimes, FaPaperPlane, FaSpinner, FaLightbulb, FaMicrophone, 
         FaThumbsUp, FaThumbsDown, FaRegSmile, FaRegCopy, FaVolumeUp } from 'react-icons/fa';
import { useTranslation } from '../utils/TranslationContext';
import { knowledgeBase } from '../data/chatbotKnowledgeBase';

const ChatBot = () => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    // Load messages from localStorage if available
    const savedMessages = localStorage.getItem('kspChatHistory');
    if (savedMessages) {
      try {
        // Parse the stored messages and ensure timestamps are valid Date objects
        const parsedMessages = JSON.parse(savedMessages);
        return parsedMessages.map(msg => {
          try {
            // Proper timestamp validation and conversion
            const timestamp = msg.timestamp ? new Date(msg.timestamp) : new Date();
            // Check if date is valid
            if (isNaN(timestamp.getTime())) {
              throw new Error('Invalid timestamp');
            }
            return { ...msg, timestamp };
          } catch (err) {
            // If timestamp is invalid, create a new one
            console.warn('Invalid timestamp for message, using current time instead');
            return { ...msg, timestamp: new Date() };
          }
        });
      } catch (error) {
        console.error('Error parsing chat history:', error);
        // Return default message if parsing fails
        return [{ 
          id: 1, 
          text: t("Hello! I'm KSP's AI assistant. How can I help you today?", "chatbot"), 
          sender: 'bot', 
          timestamp: new Date(),
          feedback: null,
          reaction: null
        }];
      }
    }
    // Default initial message
    return [{ 
      id: 1, 
      text: t("Hello! I'm KSP's AI assistant. How can I help you today?", "chatbot"), 
      sender: 'bot', 
      timestamp: new Date(),
      feedback: null,
      reaction: null
    }];
  });
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [typingTimeout, setTypingTimeout] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [conversationContext, setConversationContext] = useState(() => {
    // Load context from localStorage if available
    const savedContext = localStorage.getItem('kspChatContext');
    return savedContext ? JSON.parse(savedContext) : {
      lastTopic: null,
      userName: null,
      recentTopics: [],
      messageCount: 0
    };
  });
  const [suggestedQuestions, setSuggestedQuestions] = useState([
    t("What products do you offer?", "chatbot"),
    t("How do I place an order?", "chatbot"),
    t("Tell me about your sustainability practices", "chatbot"),
  ]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [visibleDateMarker, setVisibleDateMarker] = useState(null);
  const [isCopying, setIsCopying] = useState(false);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const chatContainerRef = useRef(null);
  const audioRef = useRef(new Audio('/sounds/message-received.mp3'));

  // Save chat history to localStorage when messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('kspChatHistory', JSON.stringify(messages));
    }
  }, [messages]);

  // Save conversation context to localStorage
  useEffect(() => {
    localStorage.setItem('kspChatContext', JSON.stringify(conversationContext));
  }, [conversationContext]);

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Focus input field when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Update conversation context when messages change
  useEffect(() => {
    if (messages.length > 1) {
      setConversationContext(prev => ({
        ...prev,
        messageCount: messages.length
      }));
    }
  }, [messages]);

  // Add scroll event listener to show date markers
  useEffect(() => {
    if (isOpen && chatContainerRef.current) {
      const container = chatContainerRef.current;
      
      const handleScroll = () => {
        // Get all date markers in view
        const dateMarkers = container.querySelectorAll('[data-date-marker]');
        
        if (dateMarkers.length === 0) return;
        
        let visibleMarker = null;
        
        // Find the topmost visible marker
        for (const marker of dateMarkers) {
          const rect = marker.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          
          if (rect.top >= containerRect.top && rect.bottom <= containerRect.bottom) {
            visibleMarker = marker.getAttribute('data-date-marker');
            break;
          }
        }
        
        setVisibleDateMarker(visibleMarker);
      };
      
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [isOpen]);

  // Play notification sound when a new bot message arrives
  useEffect(() => {
    if (messages.length > 1 && messages[messages.length - 1].sender === 'bot') {
      audioRef.current.play().catch(() => {
        // Silently fail if autoplay is blocked
      });
    }
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const handleInputChange = useCallback((e) => {
    setNewMessage(e.target.value);
    
    // Show typing indicator
    setIsUserTyping(true);
    
    // Clear previous timeout
    if (typingTimeout) clearTimeout(typingTimeout);
    
    // Set new timeout to stop typing indicator after 1 second of inactivity
    const timeout = setTimeout(() => {
      setIsUserTyping(false);
    }, 1000);
    
    setTypingTimeout(timeout);
  }, [typingTimeout]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, []);

  // Get time of day for contextual greetings
  const getTimeOfDay = useCallback(() => {
    const hour = new Date().getHours();
    if (hour < 12) return t("Good morning", "chatbot");
    if (hour < 18) return t("Good afternoon", "chatbot");
    return t("Good evening", "chatbot");
  }, [t]);

  // Extract user name if provided
  const extractUserName = useCallback((message) => {
    const namePatterns = [
      /my name is (\w+)/i,
      /i am (\w+)/i,
      /i'm (\w+)/i,
      /call me (\w+)/i,
      /(\w+) here/i
    ];
    
    for (const pattern of namePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        // Capitalize first letter of name
        return match[1].charAt(0).toUpperCase() + match[1].slice(1);
      }
    }
    return null;
  }, []);

  // Check if message contains a greeting with new visitor intent
  const isNewVisitorGreeting = useCallback((message) => {
    const newVisitorPatterns = [
      /first time/i,
      /new here/i,
      /never (been|visited|ordered) before/i,
      /new customer/i
    ];
    
    return newVisitorPatterns.some(pattern => pattern.test(message));
  }, []);

  // Update conversation context with the current topic
  const updateConversationContext = useCallback((topic) => {
    setConversationContext(prev => {
      const recentTopics = [topic, ...prev.recentTopics.slice(0, 2)];
      return {
        ...prev,
        lastTopic: topic,
        recentTopics: recentTopics.filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
      };
    });
  }, []);

  // Enhanced NLP function with improved matching capabilities
  const findBotResponse = useCallback((userMessage) => {
    // ...existing code...
  }, [conversationContext, extractUserName, isNewVisitorGreeting, t, updateConversationContext]);

  // Group messages by date for visual separation
  const getMessageGroups = useCallback(() => {
    const groups = [];
    let currentGroup = { date: null, messages: [] };

    messages.forEach(message => {
      try {
        // Validate timestamp and ensure it's a Date object
        const messageTimestamp = message.timestamp instanceof Date ? 
          message.timestamp : new Date(message.timestamp);
          
        if (isNaN(messageTimestamp.getTime())) {
          console.error('Invalid timestamp for message:', message);
          // Skip messages with invalid dates or use fallback
          return;
        }
        
        const messageDate = messageTimestamp.toLocaleDateString();
        
        if (!currentGroup.date) {
          currentGroup.date = messageDate;
        } else if (currentGroup.date !== messageDate) {
          groups.push({ ...currentGroup });
          currentGroup = { date: messageDate, messages: [] };
        }
        
        currentGroup.messages.push(message);
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    if (currentGroup.date && currentGroup.messages.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }, [messages]);

  const handleSendMessage = useCallback(() => {
    if (!newMessage || newMessage.trim() === '') return;
    
    const newMessageObject = {
      id: Date.now(),
      text: newMessage.trim(),
      sender: 'user',
      timestamp: new Date(),
      feedback: null,
      reaction: null
    };
    
    setMessages(prevMessages => [...prevMessages, newMessageObject]);
    setNewMessage('');
    setIsTyping(true);
    
    setTimeout(() => {
      // Make sure we have a valid response
      let responseText;
      try {
        responseText = findBotResponse(newMessage.trim()) || "I'm sorry, I couldn't process that request.";
      } catch (error) {
        console.error("Error generating bot response:", error);
        responseText = "Sorry, I encountered an error. Please try again.";
      }
      
      const botResponse = {
        id: Date.now() + 1,
        text: responseText,
        sender: 'bot',
        timestamp: new Date(),
        feedback: null,
        reaction: null
      };
      
      setMessages(prevMessages => [...prevMessages, botResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000); // Random delay between 1-2 seconds
  }, [findBotResponse, newMessage]);
  
  const handleSuggestedQuestion = useCallback((question) => {
    if (!question) return;
    
    // Create user message
    const userMessage = {
      id: Date.now(),
      text: question,
      sender: 'user',
      timestamp: new Date(),
      feedback: null,
      reaction: null
    };
    
    setMessages(prevMessages => [...prevMessages, userMessage]);
    setIsTyping(true);
    
    // Create bot response after delay
    setTimeout(() => {
      let responseText;
      try {
        responseText = findBotResponse(question) || "I'm sorry, I couldn't process that request.";
      } catch (error) {
        console.error("Error generating bot response:", error);
        responseText = "Sorry, I encountered an error. Please try again.";
      }
      
      const botResponse = {
        id: Date.now() + 1,
        text: responseText,
        sender: 'bot',
        timestamp: new Date(),
        feedback: null,
        reaction: null
      };
      
      setMessages(prevMessages => [...prevMessages, botResponse]);
      setIsTyping(false);
    }, 1000 + Math.random() * 1000);
  }, [findBotResponse]);

  const formatTimestamp = useCallback((timestamp) => {
    try {
      const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
      if (isNaN(date.getTime())) {
        console.error("Invalid timestamp:", timestamp);
        return ""; // Return empty string for invalid dates
      }
      return new Intl.DateTimeFormat('default', {
        hour: 'numeric',
        minute: 'numeric'
      }).format(date);
    } catch (error) {
      console.error("Error formatting timestamp:", error);
      return "";
    }
  }, []);

  const formatDateMarker = useCallback((date) => {
    const today = new Date().toLocaleDateString();
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString();
    
    if (date === today) return t("Today", "chatbot");
    if (date === yesterday) return t("Yesterday", "chatbot");
    return date;
  }, [t]);

  // Handle speech recognition
  const startListening = useCallback(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      
      recognition.onstart = () => {
        setIsListening(true);
      };
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setNewMessage(transcript);
        setIsListening(false);
      };
      
      recognition.onerror = () => {
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
      };
      
      recognition.start();
    } else {
      alert(t("Speech recognition is not supported in your browser.", "chatbot"));
    }
  }, [t]);

  // Message feedback handlers
  const handleMessageFeedback = useCallback((messageId, feedbackType) => {
    setMessages(prevMessages => 
      prevMessages.map(message => 
        message.id === messageId 
          ? { ...message, feedback: feedbackType }
          : message
      )
    );
  }, []);
  
  // Message reaction handlers
  const handleReactionClick = useCallback((messageId) => {
    setShowEmojiPicker(showEmojiPicker === messageId ? null : messageId);
  }, [showEmojiPicker]);
  
  const addReaction = useCallback((messageId, reactionType) => {
    setMessages(prevMessages => 
      prevMessages.map(message => 
        message.id === messageId 
          ? { ...message, reaction: reactionType }
          : message
      )
    );
    setShowEmojiPicker(null);
  }, []);
  
  // Export chat history
  const exportChatHistory = useCallback(() => {
    const chatHistory = messages.map(msg => {
      const sender = msg.sender === 'bot' ? 'KSP Assistant' : 'You';
      const time = new Date(msg.timestamp).toLocaleString();
      return `${time} - ${sender}: ${msg.text}`;
    }).join('\n\n');
    
    const blob = new Blob([chatHistory], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ksp-chat-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [messages]);

  // Clear chat history
  const clearChatHistory = useCallback(() => {
    if (window.confirm(t("Are you sure you want to clear the chat history?", "chatbot"))) {
      setMessages([{
        id: Date.now(),
        text: t("Hello! I'm KSP's AI assistant. How can I help you today?", "chatbot"), 
        sender: 'bot', 
        timestamp: new Date(),
        feedback: null,
        reaction: null
      }]);
      
      // Reset conversation context
      setConversationContext(prev => ({
        ...prev,
        lastTopic: null,
        recentTopics: [],
        messageCount: 0
      }));
    }
  }, [t]);

  // Copy bot message to clipboard
  const copyToClipboard = useCallback((text) => {
    if (!text) return;
    
    navigator.clipboard.writeText(text).then(() => {
      setIsCopying(true);
      setTimeout(() => setIsCopying(false), 2000);
    });
  }, []);

  // Read message aloud
  const speakMessage = useCallback((text) => {
    if (!text) return;
    
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    } else {
      alert(t("Text-to-speech is not supported in your browser.", "chatbot"));
    }
  }, [t]);

  // Simple reactions list
  const reactions = useMemo(() => ['👍', '👎', '❤️', '😊', '😮'], []);

  return (
    <>
      {/* Chat button */}
      <motion.button
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-blue-600 to-blue-800 
                   text-white p-4 rounded-full shadow-lg hover:shadow-xl"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={toggleChat}
        aria-label={isOpen ? t("Close chat", "chatbot") : t("Open chat", "chatbot")}
      >
        {isOpen ? (
          <FaTimes className="text-xl" />
        ) : (
          <FaComments className="text-xl" />
        )}
      </motion.button>

      {/* Chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-24 right-6 z-50 w-80 sm:w-96 h-[500px] max-h-[80vh]
                       bg-white text-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200
                       flex flex-col"
            role="dialog"
            aria-labelledby="chat-title"
          >
            {/* Chat header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-4">
              <div className="flex items-center">
                <div className="bg-white/20 p-2 rounded-full mr-3">
                  <FaRobot className="text-xl" />
                </div>
                <div>
                  <h3 className="font-bold" id="chat-title">{t("KSP Assistant", "chatbot")}</h3>
                  <p className="text-xs text-blue-100">{t("Online | AI Powered", "chatbot")}</p>
                </div>
                <div className="ml-auto flex">
                  {/* Export chat button */}
                  <button 
                    onClick={exportChatHistory}
                    className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors mr-2"
                    aria-label={t("Export chat history", "chatbot")}
                    title={t("Export chat history", "chatbot")}
                  >
                    <FaVolumeUp className="text-sm" />
                  </button>
                  
                  {/* Clear chat button */}
                  <button 
                    onClick={clearChatHistory}
                    className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors mr-2"
                    aria-label={t("Clear chat", "chatbot")}
                    title={t("Clear chat", "chatbot")}
                  >
                    <FaTimes className="text-sm" />
                  </button>
                  
                  {/* Close button */}
                  <button 
                    onClick={toggleChat}
                    className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition-colors"
                    aria-label={t("Close chat", "chatbot")}
                  >
                    <FaTimes className="text-sm" />
                  </button>
                </div>
              </div>
            </div>

            {/* Date marker overlay (when scrolling) */}
            {visibleDateMarker && (
              <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-10">
                <div className="bg-blue-600 text-white px-4 py-1 rounded-full text-xs shadow-md">
                  {formatDateMarker(visibleDateMarker)}
                </div>
              </div>
            )}

            {/* Messages area */}
            <div 
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-4 bg-gray-50"
              role="log"
              aria-live="polite"
            >
              {getMessageGroups().map((group, groupIndex) => (
                <div key={groupIndex}>
                  {/* Date marker */}
                  <div 
                    className="flex justify-center my-3"
                    data-date-marker={group.date}
                  >
                    <div className="bg-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs">
                      {formatDateMarker(group.date)}
                    </div>
                  </div>
                  
                  {/* Messages in this date group */}
                  {group.messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`mb-4 flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                      role="article"
                      aria-label={`${message.sender === 'user' ? 'Your message' : 'Assistant message'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                          message.sender === 'user'
                            ? 'bg-blue-600 text-white rounded-tr-none'
                            : 'bg-white text-gray-800 rounded-tl-none shadow-md border border-gray-100'
                        } relative group`}
                      >
                        {/* Message text with link detection - Add null check */}
                        <p className="text-sm whitespace-pre-wrap">
                          {message.text ? 
                            message.text.split(/\b((?:https?:\/\/|www\.)[^\s]+\.[^\s]+)\b/).map((part, i) => {
                              if (part && part.match && part.match(/^(https?:\/\/|www\.)/)) {
                                return (
                                  <a 
                                    key={i} 
                                    href={part.startsWith('www.') ? `https://${part}` : part} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-300 hover:underline"
                                  >
                                    {part}
                                  </a>
                                );
                              } else {
                                return part || '';
                              }
                            })
                          : ''}
                        </p>
                        
                        <div className="flex justify-between items-center mt-1">
                          <span className={`text-xs ${
                            message.sender === 'user' 
                              ? 'text-blue-100' 
                              : 'text-gray-500'
                          }`}>
                            {formatTimestamp(message.timestamp)}
                          </span>
                          
                          {/* Reactions display */}
                          {message.reaction && (
                            <span className="ml-2 text-xs">
                              {message.reaction}
                            </span>
                          )}
                        </div>
                        
                        {/* Message actions - only visible on hover */}
                        <div className={`absolute ${message.sender === 'user' ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} 
                                       top-1/2 -translate-y-1/2 bg-white rounded-lg shadow-md border border-gray-100 p-1
                                       flex items-center opacity-0 group-hover:opacity-100 transition-opacity`}>
                          
                          {/* Feedback buttons for bot messages */}
                          {message.sender === 'bot' && (
                            <>
                              <button
                                onClick={() => handleMessageFeedback(message.id, 'helpful')}
                                className={`p-1 rounded-full ${message.feedback === 'helpful' ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-green-600'}`}
                                aria-label={t("Mark as helpful", "chatbot")}
                                title={t("Helpful", "chatbot")}
                              >
                                <FaThumbsUp size={12} />
                              </button>
                              <button
                                onClick={() => handleMessageFeedback(message.id, 'unhelpful')}
                                className={`p-1 rounded-full ${message.feedback === 'unhelpful' ? 'text-red-600 bg-red-50' : 'text-gray-400 hover:text-red-600'}`}
                                aria-label={t("Mark as unhelpful", "chatbot")}
                                title={t("Not helpful", "chatbot")}
                              >
                                <FaThumbsDown size={12} />
                              </button>
                            </>
                          )}
                          
                          {/* Copy button for bot messages */}
                          {message.sender === 'bot' && (
                            <button
                              onClick={() => copyToClipboard(message.text)}
                              className="p-1 rounded-full text-gray-400 hover:text-blue-600"
                              aria-label={t("Copy message", "chatbot")}
                              title={isCopying ? t("Copied!", "chatbot") : t("Copy to clipboard", "chatbot")}
                            >
                              <FaRegCopy size={12} />
                            </button>
                          )}
                          
                          {/* Speak message button */}
                          <button
                            onClick={() => speakMessage(message.text)}
                            className="p-1 rounded-full text-gray-400 hover:text-blue-600"
                            aria-label={t("Speak message", "chatbot")}
                            title={t("Read aloud", "chatbot")}
                          >
                            <FaVolumeUp size={12} />
                          </button>
                          
                          {/* Reaction button for all messages */}
                          <button
                            onClick={() => handleReactionClick(message.id)}
                            className="p-1 rounded-full text-gray-400 hover:text-blue-600"
                            aria-label={t("Add reaction", "chatbot")}
                            title={t("Add reaction", "chatbot")}
                          >
                            <FaRegSmile size={12} />
                          </button>
                          
                          {/* Emoji picker popover */}
                          {showEmojiPicker === message.id && (
                            <div className="absolute top-full mt-1 bg-white shadow-lg rounded-lg border border-gray-200 p-1 z-10">
                              <div className="flex">
                                {reactions.map((emoji, i) => (
                                  <button
                                    key={i}
                                    onClick={() => addReaction(message.id, emoji)}
                                    className="p-1 hover:bg-gray-100 rounded"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ))}

              {isTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start mb-4"
                  aria-live="polite"
                  aria-label={t("Bot is typing", "chatbot")}
                >
                  <div className="bg-white text-gray-600 shadow-md border border-gray-100 rounded-2xl rounded-tl-none px-4 py-2">
                    <div className="flex space-x-2">
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, repeatDelay: 0.2 }}
                        className="w-2 h-2 bg-blue-600 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0.2, repeatDelay: 0.2 }}
                        className="w-2 h-2 bg-blue-600 rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -5, 0] }}
                        transition={{ repeat: Infinity, duration: 0.6, delay: 0.4, repeatDelay: 0.2 }}
                        className="w-2 h-2 bg-blue-600 rounded-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {/* User typing indicator */}
              {isUserTyping && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end mb-4"
                  aria-live="polite"
                  aria-label={t("You are typing", "chatbot")}
                >
                  <div className="bg-blue-100 text-blue-600 rounded-2xl rounded-tr-none px-3 py-1 text-xs">
                    {t("typing...", "chatbot")}
                  </div>
                </motion.div>
              )}

              {/* Suggested questions section */}
              {!isTyping && messages.length > 0 && messages[messages.length - 1].sender === 'bot' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 mt-2"
                >
                  <div className="flex items-center mb-2">
                    <FaLightbulb className="text-yellow-500 mr-2" />
                    <span className="text-xs text-gray-500">
                      {t("Suggested questions:", "chatbot")}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedQuestions.map((question, index) => (
                      <motion.button
                        key={index}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleSuggestedQuestion(question)}
                        className="bg-blue-50 text-blue-700 border border-blue-100 text-xs py-1 px-3 rounded-full hover:bg-blue-100"
                      >
                        {question}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="p-3 border-t bg-white border-gray-200">
              {/* Message input with dynamic height */}
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={newMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={t("Type your message...", "chatbot")}
                  className="w-full p-3 pr-20 bg-gray-100 text-gray-800 placeholder-gray-500 border-gray-200 
                           border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  style={{ 
                    minHeight: '48px',
                    maxHeight: '120px',
                    height: Math.min(120, Math.max(48, newMessage && newMessage.split ? newMessage.split('\n').length * 24 : 48)) + 'px'
                  }}
                  aria-label={t("Message input", "chatbot")}
                />
                
                {/* Input action buttons */}
                <div className="absolute right-2 bottom-2 flex items-center space-x-1">
                  {/* Voice input button */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={startListening}
                    className={`p-2 rounded-full ${
                      isListening 
                        ? 'bg-red-500 text-white' 
                        : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                    }`}
                    disabled={isTyping}
                    aria-label={isListening ? t("Stop listening", "chatbot") : t("Start voice input", "chatbot")}
                    title={isListening ? t("Stop listening", "chatbot") : t("Voice input", "chatbot")}
                  >
                    <FaMicrophone className={isListening ? 'animate-pulse' : ''} />
                  </motion.button>
                  
                  {/* Send button */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={handleSendMessage}
                    className={`p-2 rounded-full ${
                      newMessage.trim() === '' 
                        ? 'bg-blue-300 text-white cursor-not-allowed' 
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                    disabled={newMessage.trim() === '' || isTyping}
                    aria-label={t("Send message", "chatbot")}
                    title={t("Send message", "chatbot")}
                  >
                    {isTyping ? (
                      <FaSpinner className="animate-spin" />
                    ) : (
                      <FaPaperPlane />
                    )}
                  </motion.button>
                </div>
              </div>
              
              {/* Small disclaimer */}
              <div className="text-center mt-2">
                <small className="text-xs text-gray-400">
                  {t("KSP's AI assistant helps with product inquiries and support", "chatbot")}
                </small>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ChatBot;