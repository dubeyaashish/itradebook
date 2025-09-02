import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import {
  useQuery,
  useQueries,
  useQueryClient,
  useMutation,
} from '@tanstack/react-query';
import { useAuth } from '../App';
import { safeConsole } from '../utils/secureLogging';

// Constants
const MAX_COMMENT_LEN = 200;
const GC_TIME = 5 * 60 * 1000; // Garbage collection time

// API functions
const api = {
  comments: {
    getAll: async (symbolRef) => {
      const res = await axios.get(`/api/comments/${symbolRef}`);
      return res.data;
    },
    create: async ({ symbol_ref, comment }) => {
      const res = await axios.post('/api/comments', { symbol_ref, comment });
      return res.data;
    },
    delete: async (id) => {
      await axios.delete(`/api/comments/${id}`);
      return { id };
    },
  },
  liveData: {
    fetch: async () => {
      const res = await axios.get('/api/live');
      return res.data;
    },
  },
  symbolNames: {
    getAll: async () => {
      const res = await axios.get('/api/symbol-names');
      return res.data;
    },
    set: async ({ symbol_ref, custom_name }) => {
      const res = await axios.post('/api/symbol-names', { symbol_ref, custom_name });
      return res.data;
    },
    delete: async (symbolRef) => {
      await axios.delete(`/api/symbol-names/${symbolRef}`);
      return { symbol_ref: symbolRef };
    },
  },
};

// Utility functions
const formatNumber = (value, digits = 4) => {
  const num = Number(value);
  if (Number.isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
};

const getProfitClass = (value) => {
  const num = Number(value);
  if (num > 0) return 'num-up';
  if (num < 0) return 'num-down';
  return 'num-flat';
};

const getInitials = (name) => (name?.[0] || 'U').toUpperCase();

// Custom hooks
const useAllSymbolComments = (symbolRefs, userId) => {
  const safeRefs = Array.isArray(symbolRefs) ? symbolRefs : [];
  return useQueries({
    queries: safeRefs.map((symbolRef) => ({
      queryKey: ['comments', symbolRef, userId], // Include userId in cache key
      queryFn: () => api.comments.getAll(symbolRef),
      enabled: Boolean(symbolRef) && Boolean(userId),
      staleTime: 30_000,
      gcTime: GC_TIME,
    })),
  });
};

const useLiveData = (autoRefresh, userId) => {
  const [lastTimestamps, setLastTimestamps] = useState({});
  
  const fetchLiveData = useCallback(async () => {
    try {
      const newData = await api.liveData.fetch();

      // Backend already returns second latest for each symbol, use directly
      const processedData = newData;

      // Update timestamps for change detection
      const newTimestamps = processedData.reduce((acc, item) => {
        acc[item.symbol_ref] = item.timestamp;
        return acc;
      }, {});

      setLastTimestamps((prev) => {
        const changed = Object.keys(newTimestamps).filter(
          (symbol) => newTimestamps[symbol] !== prev[symbol]
        );
        if (changed.length > 0) {
          safeConsole.log('Data updated for symbols:', changed);
        }
        return newTimestamps;
      });

      return processedData;
    } catch (error) {
      // Silent error handling
      throw error;
    }
  }, []);

  const query = useQuery({
    queryKey: ['liveData', userId], // Include userId in cache key
    queryFn: fetchLiveData,
    // Hybrid approach: short polling as backup + WebSocket for instant updates
    refetchInterval: autoRefresh ? 30000 : false, // 30 second backup polling
    staleTime: 5000, // 5 seconds
    gcTime: GC_TIME,
    placeholderData: (prev) => prev,
    enabled: !!userId, // Only fetch if user is logged in
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnReconnect: true, // Do refetch when internet connection restored
    select: useCallback((data) => {
      return data?.map((item) => ({
        ...item,
        isUpdated: lastTimestamps[item.symbol_ref] !== item.timestamp,
      })) || [];
    }, [lastTimestamps]),
  });

  return query;
};

// Custom Symbol Name component
const CustomSymbolName = React.memo(({ symbolRef, customName, onSave, onDelete, isEditing, setIsEditing }) => {
  const [tempName, setTempName] = useState(customName || '');
  const [isSaving, setIsSaving] = useState(false);
  
  const handleSave = async () => {
    if (!tempName.trim()) {
      setIsEditing(false);
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(symbolRef, tempName.trim());
      setIsEditing(false);
    } catch (error) {
      // Silent error handling
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCancel = () => {
    setTempName(customName || '');
    setIsEditing(false);
  };
  
  const handleDelete = async () => {
    if (window.confirm('Remove custom name for this symbol?')) {
      try {
        await onDelete(symbolRef);
      } catch (error) {
        // Silent error handling
      }
    }
  };
  
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };
  
  if (isEditing) {
    return (
      <div className="custom-name-editor">
        <input
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter custom name..."
          maxLength={100}
          autoFocus
          disabled={isSaving}
          className="custom-name-input"
        />
        <div className="custom-name-actions">
          <button
            onClick={handleSave}
            disabled={isSaving || !tempName.trim()}
            className="btn-save"
            title="Save"
          >
            <i className="fas fa-check" />
          </button>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="btn-cancel"
            title="Cancel"
          >
            <i className="fas fa-times" />
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="custom-name-display">
      {customName ? (
        <>
          <span className="custom-name-text" title={customName}>
            {customName}
          </span>
          <div className="custom-name-controls">
            <button
              onClick={() => setIsEditing(true)}
              className="btn-edit"
              title="Edit custom name"
            >
              <i className="fas fa-edit" />
            </button>
            <button
              onClick={handleDelete}
              className="btn-delete"
              title="Remove custom name"
            >
              <i className="fas fa-trash-alt" />
            </button>
          </div>
        </>
      ) : (
        <button
          onClick={() => setIsEditing(true)}
          className="btn-add-name"
          title="Add custom name"
        >
          <i className="fas fa-plus" />
          <span>Add Name</span>
        </button>
      )}
    </div>
  );
});

CustomSymbolName.displayName = 'CustomSymbolName';

// Comments component
const Comments = React.memo(({ symbolRef, comments, onAddComment, onDeleteComment, isAddingComment, isDeletingComment }) => {
  const [value, setValue] = useState('');
  const [showAll, setShowAll] = useState(false);
  
  const overflow = comments.length > 3;
  const visible = showAll ? comments : comments.slice(-3);
  const remaining = MAX_COMMENT_LEN - value.length;
  const tooLong = remaining < 0;

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!value.trim() || tooLong) return;
    onAddComment({ symbolRef, text: value.trim() });
    setValue('');
  }, [value, tooLong, onAddComment, symbolRef]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  const handleDelete = useCallback((commentId) => {
    if (window.confirm('Delete this comment?')) {
      onDeleteComment({ id: commentId, symbolRef });
    }
  }, [onDeleteComment, symbolRef]);

  return (
    <div className="comments-section">
      <div className="section-header comments-header">
        <div className="comments-title">
          <i className="fas fa-comments" />
          <span>Comments</span>
        </div>
        <span className="count-chip">{comments.length}</span>
      </div>

      <div className="comments-list">
        {comments.length === 0 ? (
          <div className="comment-empty">
            <i className="fas fa-message" />
            <span>Be the first to comment</span>
          </div>
        ) : (
          visible.map((comment) => (
            <div
              key={comment.id}
              className={`comment-item ${comment._optimistic ? 'is-optimistic' : ''}`}
              title={comment._optimistic ? 'Sending…' : undefined}
            >
              <div className="comment-left">
                <div className="comment-avatar">{getInitials(comment.username)}</div>
                <div className="comment-body">
                  <div className="comment-head">
                    <span className="comment-user">{comment.username || 'User'}</span>
                    <span className="comment-date">
                      {new Date(comment.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="comment-text">{comment.comment}</div>
                </div>
              </div>
              <button
                className="comment-delete"
                aria-label="Delete comment"
                onClick={() => handleDelete(comment.id)}
                disabled={comment._optimistic || isDeletingComment}
              >
                <i className="fas fa-trash" />
              </button>
            </div>
          ))
        )}
      </div>

      {overflow && (
        <button
          className="show-all-btn"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? 'Show recent only' : `Show all (${comments.length})`}
        </button>
      )}

      <form onSubmit={handleSubmit} className="comment-form">
        <input
          type="text"
          name="comment"
          className="comment-input"
          placeholder="Add a comment…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_COMMENT_LEN + 50}
        />
        <button
          type="submit"
          className="send-btn"
          disabled={!value.trim() || tooLong || isAddingComment}
          title="Send"
        >
          <i className="fas fa-paper-plane" />
        </button>
        <div className={`char-counter ${tooLong ? 'over' : ''}`}>
          {Math.max(remaining, 0)}/{MAX_COMMENT_LEN}
        </div>
      </form>
    </div>
  );
});

Comments.displayName = 'Comments';

// Trading card component
const TradingCard = React.memo(({ 
  item, 
  comments, 
  onAddComment, 
  onDeleteComment, 
  isAddingComment, 
  isDeletingComment,
  customName,
  onSaveCustomName,
  onDeleteCustomName,
  isSavingCustomName
}) => {
  const profitRatio = Number(item.profit_ratio || 0);
  const isProfit = profitRatio >= 0;
  const [isEditingName, setIsEditingName] = useState(false);

  return (
    <div 
      className={`trading-card flex ${item.isUpdated ? 'card-updated' : ''}`}
      style={{
        position: 'relative',
        animation: item.isUpdated ? 'cardUpdate 0.5s ease' : 'none'
      }}
    >
      <div className="flex-1">
        {/* Card Header */}
        <div className="card-header">
          <div className="flex items-center space-x-3">
            <div className={`symbol-icon ${isProfit ? 'profit' : 'loss'}`}>
              {item.symbol_ref ? item.symbol_ref.charAt(0) : '?'}
            </div>
            <div className="symbol-info">
              <h3 className="symbol-name">{item.symbol_ref || 'Unknown'}</h3>
              <CustomSymbolName
                symbolRef={item.symbol_ref}
                customName={customName}
                onSave={onSaveCustomName}
                onDelete={onDeleteCustomName}
                isEditing={isEditingName}
                setIsEditing={setIsEditingName}
              />
              <p className="symbol-date">{formatDate(item.date)}</p>
            </div>
          </div>
          <div className="profit-display">
            <div className={`profit-ratio ${getProfitClass(profitRatio)}`}>
              {formatNumber(profitRatio)}
            </div>
            <div className="profit-total">
              ${formatNumber(item.profit_total)}
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="card-metrics">
          <div className="metric-row">
            <div className="metric">
              <span className="metric-label">Market Price</span>
              <span className="metric-value">{formatNumber(item.mktprice, 2)}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Net Position</span>
              <span className={`metric-value ${getProfitClass(item.difflot)}`}>
                {formatNumber(item.difflot)}
              </span>
            </div>
          </div>
          <div className="metric-row">
            <div className="metric">
              <span className="metric-label">Avg Buy</span>
              <span className="metric-value">{formatNumber(item.avgbuy, 2)}</span>
            </div>
            <div className="metric">
              <span className="metric-label">Avg Sell</span>
              <span className="metric-value">{formatNumber(item.avgsell, 2)}</span>
            </div>
          </div>
        </div>

        {/* Company Section */}
        <div className="card-section company-section">
          <div className="section-header">
            <i className="fas fa-building" />
            <span>Company</span>
          </div>
          <div className="section-content">
            <div className="order-info">
              <div className="order-group">
                <span className="order-label">Buy Orders</span>
                <div className="order-details">
                  Lot: <span>{formatNumber(item.buysize1)}</span> avg{' '}
                  <span>{formatNumber(item.buyprice1, 2)}</span>
                </div>
              </div>
              <div className="order-group">
                <span className="order-label">Sell Orders</span>
                <div className="order-details">
                  Lot: <span>{formatNumber(item.sellsize1)}</span> avg{' '}
                  <span>{formatNumber(item.sellprice1, 2)}</span>
                </div>
              </div>
            </div>
            <div className="balance-info">
              <div className="balance-item">
                <span>Balance:</span>
                <span>{formatNumber(item.balance)}</span>
              </div>
              <div className="balance-item">
                <span>Equity:</span>
                <span>{formatNumber(item.equity)}</span>
              </div>
              <div className="balance-item">
                <span>Floating:</span>
                <span className={`num-emphasis ${getProfitClass(item.floating)}`}>
                  {formatNumber(item.floating)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Exp Section */}
        <div className="card-section exp-section">
          <div className="section-header">
            <i className="fas fa-users" />
            <span>Exp</span>
          </div>
          <div className="section-content">
            <div className="order-info">
              <div className="order-group">
                <span className="order-label">Exp Buy Orders</span>
                <div className="order-details">
                  Lot: <span>{formatNumber(item.sellsize2)}</span> avg{' '}
                  <span>{formatNumber(item.sellprice2, 2)}</span>
                </div>
              </div>
              <div className="order-group">
                <span className="order-label">Exp Sale Orders</span>
                <div className="order-details">
                  Lot: <span>{formatNumber(item.buysize2)}</span> avg{' '}
                  <span>{formatNumber(item.buyprice2, 2)}</span>
                </div>
              </div>
            </div>
            <div className="balance-info">
              <div className="balance-item">
                <span>Equity:</span>
                <span>{formatNumber(item.bal || 0)}</span>
              </div>
              <div className="balance-item">
                <span>Floating:</span>
                <span className={`num-emphasis ${getProfitClass(item.bald)}`}>
                  {formatNumber(item.bald || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="card-section totals-section">
          <div className="section-header">
            <i className="fas fa-calculator" />
            <span>Totals</span>
          </div>
          <div className="section-content">
            <div className="total-row">
              <div className="total-item">
                <span>Buy Lot:</span>
                <span>{formatNumber(item.buylot)}</span>
              </div>
              <div className="total-item">
                <span>Sell Lot:</span>
                <span>{formatNumber(item.selllot)}</span>
              </div>
            </div>
            <div className="total-row">
              <div className="total-item">
                <span>Ratio:</span>
                <span className={`num-emphasis ${getProfitClass(item.sal)}`}>
                  {formatNumber(item.sal || 0)}
                </span>
              </div>
              <div className="total-item">
                <span>Lot Ratio:</span>
                <span className={`num-emphasis ${getProfitClass(item.sald)}`}>
                  {formatNumber(item.sald || 0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <Comments 
          symbolRef={item.symbol_ref} 
          comments={comments} 
          onAddComment={onAddComment}
          onDeleteComment={onDeleteComment}
          isAddingComment={isAddingComment}
          isDeletingComment={isDeletingComment}
        />
      </div>

      {/* Action Buttons */}
      <div className="action-buttons-container">
        <button className="action-button" onClick={() => {}}>1</button>
        <button className="action-button" onClick={() => {}}>2</button>
        <button className="action-button" onClick={() => {}}>3</button>
      </div>
    </div>
  );
});

TradingCard.displayName = 'TradingCard';

// Main component
const DailySavedDataPage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [errorMessage, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState(user?.id);

  // WebSocket for real-time invalidation (simple heartbeat approach)
  useEffect(() => {
    if (!user?.id) return;
    
    const apiURL = process.env.REACT_APP_API_URL || 'http://localhost:3001';
    const socket = io(apiURL, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      timeout: 5000,
      forceNew: true
    });
    
    socket.on('connect', () => {
      console.log('🔌 WebSocket connected (change detection mode)');
    });
    
    socket.on('connect_error', (error) => {
      console.log('🔌 WebSocket connection error:', error);
    });
    
    socket.on('disconnect', () => {
      console.log('🔌 WebSocket disconnected');
    });
    
    // Listen for actual data changes and refresh immediately
    socket.on('data_changed', (data) => {
      console.log('📡 Heartbeat received - refreshing data');
      queryClient.invalidateQueries({ queryKey: ['liveData'] });
      setLastUpdated(new Date());
    });

    return () => {
      socket.disconnect();
    };
  }, [user?.id, queryClient]);

  // Clear cache when user changes (but preserve shared data when switching between regular users)
  useEffect(() => {
    if (user?.id !== currentUserId) {
      // Clear all live data and comments as they are user-specific
      queryClient.removeQueries({ queryKey: ['liveData'] });
      queryClient.removeQueries({ queryKey: ['comments'] });
      
      // Only clear symbol names if switching between different user types
      // (preserve shared names when switching between regular users)
      const previousUserType = currentUserId ? 'unknown' : null; // We don't store previous user type, so clear to be safe
      if (previousUserType !== user?.user_type) {
        queryClient.removeQueries({ queryKey: ['symbolNames'] });
      }
      
      setCurrentUserId(user?.id);
    }
  }, [user?.id, currentUserId, queryClient]);

  // Data fetching with user-specific cache keys
  const { data, isLoading: loading, error } = useLiveData(autoRefresh, user?.id);

  // Normalize live data to an array
  const list = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
  }, [data]);

  // Fetch comments for all symbols
  const symbolRefs = useMemo(() => list.map((item) => item.symbol_ref), [list]);
  const commentsQueries = useAllSymbolComments(symbolRefs, user?.id);

  // Map: symbol_ref -> comments[]
  const commentsMap = useMemo(() => {
    return symbolRefs.reduce((map, ref, i) => {
      map[ref] = commentsQueries[i]?.data || [];
      return map;
    }, {});
  }, [symbolRefs, commentsQueries]);

  // Fetch custom symbol names with user-type-based cache key
  const { data: customNamesData = {} } = useQuery({
    queryKey: ['symbolNames', user?.user_type === 'regular' ? 'shared' : user?.id], // Shared for regular users, user-specific for others
    queryFn: api.symbolNames.getAll,
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: GC_TIME,
  });

  // Comment mutations
  const addCommentMutation = useMutation({
    mutationFn: ({ symbolRef, text }) => 
      api.comments.create({ symbol_ref: symbolRef, comment: text }),
    onMutate: async ({ symbolRef, text }) => {
      const queryKey = ['comments', symbolRef, user?.id];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey) || [];
      const optimistic = {
        id: 'temp-' + Date.now(),
        username: 'You',
        comment: text,
        created_at: new Date().toISOString(),
        _optimistic: true,
      };
      queryClient.setQueryData(queryKey, [...previous, optimistic]);
      return { previous, symbolRef, queryKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSuccess: (newComment, vars) => {
      const queryKey = ['comments', vars.symbolRef, user?.id];
      const current = queryClient.getQueryData(queryKey) || [];
      if (newComment?.id) {
        const withoutTemp = current.filter((c) => !c._optimistic);
        queryClient.setQueryData(queryKey, [...withoutTemp, newComment]);
      } else {
        queryClient.invalidateQueries({ queryKey });
      }
    },
    onSettled: (_res, _err, vars) => {
      const queryKey = ['comments', vars.symbolRef, user?.id];
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: ({ id }) => api.comments.delete(id),
    onMutate: async ({ id, symbolRef }) => {
      const queryKey = ['comments', symbolRef, user?.id];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey) || [];
      queryClient.setQueryData(
        queryKey,
        previous.filter((c) => c.id !== id)
      );
      return { previous, symbolRef, queryKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSettled: (_res, _err, vars) => {
      const queryKey = ['comments', vars.symbolRef, user?.id];
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Custom name mutations
  const saveCustomNameMutation = useMutation({
    mutationFn: ({ symbol_ref, custom_name }) => 
      api.symbolNames.set({ symbol_ref, custom_name }),
    onMutate: async ({ symbol_ref, custom_name }) => {
      const queryKey = ['symbolNames', user?.user_type === 'regular' ? 'shared' : user?.id];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey) || {};
      queryClient.setQueryData(queryKey, { ...previous, [symbol_ref]: custom_name });
      return { previous, queryKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSettled: () => {
      const queryKey = ['symbolNames', user?.user_type === 'regular' ? 'shared' : user?.id];
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteCustomNameMutation = useMutation({
    mutationFn: (symbolRef) => api.symbolNames.delete(symbolRef),
    onMutate: async (symbolRef) => {
      const queryKey = ['symbolNames', user?.user_type === 'regular' ? 'shared' : user?.id];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey) || {};
      const updated = { ...previous };
      delete updated[symbolRef];
      queryClient.setQueryData(queryKey, updated);
      return { previous, queryKey };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
    },
    onSettled: () => {
      const queryKey = ['symbolNames', user?.user_type === 'regular' ? 'shared' : user?.id];
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Event handlers
  const handleAddComment = useCallback((params) => {
    addCommentMutation.mutate(params);
  }, [addCommentMutation]);

  const handleDeleteComment = useCallback((params) => {
    deleteCommentMutation.mutate(params);
  }, [deleteCommentMutation]);

  const handleSaveCustomName = useCallback((symbolRef, customName) => {
    saveCustomNameMutation.mutate({ symbol_ref: symbolRef, custom_name: customName });
  }, [saveCustomNameMutation]);

  const handleDeleteCustomName = useCallback((symbolRef) => {
    deleteCustomNameMutation.mutate(symbolRef);
  }, [deleteCustomNameMutation]);

  const refreshData = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['liveData', user?.id] });
  }, [queryClient, user?.id]);

  // Effects
  useEffect(() => {
    if (data) {

      setError('');
    }
  }, [data]);

  useEffect(() => {
    if (error) {
      setError(error?.response?.data?.error || error?.message || 'Failed to load live data');
    }
  }, [error]);

  // Prefetch live data
  useEffect(() => {
    if (list.length > 0 && user?.id) {
      queryClient.prefetchQuery({
        queryKey: ['liveData', user.id],
        queryFn: api.liveData.fetch,
        staleTime: 2000,
      });
    }
  }, [list, queryClient, user?.id]);

  // Dynamic styles - Improved CSS
  useEffect(() => {
    const styles = `
      /* Modern Trading Dashboard Styles */
      * {
        box-sizing: border-box;
      }

      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
        min-height: 100vh;
        color: #f8fafc;
      }

      /* Improved Grid Layout - Fills all available space */
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
        gap: 1.5rem;
        width: 100%;
        max-width: none;
        padding: 0;
        margin: 0;
      }

      /* Full width container */
      .live-dashboard {
        width: 100%;
        padding: 1.5rem;
        min-height: 100vh;
      }

      /* Enhanced Trading Card */
      .trading-card {
        background: rgba(30, 41, 59, 0.95);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-radius: 1rem;
        padding: 1.5rem;
        position: relative;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        overflow: hidden;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      }

      /* Gradient top border */
      .trading-card::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, #3b82f6, #06b6d4, #10b981);
        border-radius: 1rem 1rem 0 0;
      }

      /* Hover effects */
      .trading-card:hover {
        transform: translateY(-4px);
        border-color: rgba(59, 130, 246, 0.3);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      }

      /* Card Header Improvements */
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 1.5rem;
      }

      .symbol-icon {
        width: 48px;
        height: 48px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        font-weight: bold;
        color: white;
        box-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.2);
      }

      .symbol-icon.profit {
        background: linear-gradient(135deg, #10b981, #059669);
      }

      .symbol-icon.loss {
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }

      .symbol-name {
        font-size: 1.125rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
        color: #f8fafc;
      }

      .symbol-info {
        flex: 1;
        min-width: 0;
      }

      /* Custom Symbol Name Styles */
      .custom-name-display {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0.25rem 0;
        min-height: 24px;
      }

      .custom-name-text {
        color: #3b82f6;
        font-size: 0.875rem;
        font-weight: 500;
        font-style: italic;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .custom-name-controls {
        display: flex;
        gap: 0.25rem;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .custom-name-display:hover .custom-name-controls {
        opacity: 1;
      }

      .btn-edit, .btn-delete, .btn-save, .btn-cancel {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        padding: 0.25rem;
        border-radius: 0.25rem;
        transition: all 0.2s;
        font-size: 0.75rem;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .btn-edit:hover {
        color: #3b82f6;
        background: rgba(59, 130, 246, 0.1);
      }

      .btn-delete:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }

      .btn-save {
        color: #10b981;
      }

      .btn-save:hover {
        background: rgba(16, 185, 129, 0.1);
      }

      .btn-save:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-cancel:hover {
        color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
      }

      .btn-add-name {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        color: #3b82f6;
        cursor: pointer;
        padding: 0.375rem 0.75rem;
        border-radius: 0.375rem;
        transition: all 0.2s;
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .btn-add-name:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.3);
        transform: scale(1.02);
      }

      .custom-name-editor {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0.25rem 0;
      }

      .custom-name-input {
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 0.375rem;
        padding: 0.375rem 0.5rem;
        color: #f8fafc;
        font-size: 0.875rem;
        width: 180px;
        transition: all 0.2s;
      }

      .custom-name-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
      }

      .custom-name-input::placeholder {
        color: #64748b;
      }

      .custom-name-input:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .custom-name-actions {
        display: flex;
        gap: 0.25rem;
      }

      .symbol-date {
        color: #94a3b8;
        font-size: 0.875rem;
      }

      .profit-display {
        text-align: right;
      }

      .profit-ratio {
        font-size: 1.5rem;
        font-weight: 700;
        margin-bottom: 0.25rem;
      }

      .profit-total {
        color: #94a3b8;
        font-size: 0.875rem;
      }

      /* Enhanced Metrics Grid */
      .card-metrics {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .metric-row {
        display: contents;
      }

      .metric {
        background: rgba(15, 23, 42, 0.6);
        padding: 1rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(148, 163, 184, 0.05);
        transition: all 0.2s;
      }

      .metric:hover {
        background: rgba(15, 23, 42, 0.8);
        border-color: rgba(59, 130, 246, 0.2);
      }

      .metric-label {
        color: #94a3b8;
        font-size: 0.75rem;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.5rem;
        display: block;
      }

      .metric-value {
        font-size: 1.125rem;
        font-weight: 600;
        color: #f8fafc;
      }

      /* Section Styling */
      .card-section {
        margin-bottom: 1.5rem;
        padding-bottom: 1.5rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.1);
      }

      .card-section:last-of-type {
        margin-bottom: 0;
        padding-bottom: 0;
        border-bottom: none;
      }

      .section-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 1rem;
        color: #cbd5e1;
        font-size: 0.875rem;
        font-weight: 500;
      }

      .section-header i {
        color: #3b82f6;
        font-size: 1rem;
      }

      /* Order Information Layout */
      .order-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .order-group {
        background: rgba(15, 23, 42, 0.4);
        padding: 0.75rem;
        border-radius: 0.5rem;
        border-left: 3px solid #3b82f6;
      }

      .order-label {
        color: #94a3b8;
        font-size: 0.75rem;
        font-weight: 500;
        margin-bottom: 0.5rem;
        display: block;
      }

      .order-details {
        font-size: 0.875rem;
        color: #f8fafc;
        line-height: 1.4;
      }

      /* Balance Information */
      .balance-info {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
      }

      .balance-item {
        text-align: center;
        padding: 0.5rem;
        background: rgba(15, 23, 42, 0.3);
        border-radius: 0.5rem;
      }

      .balance-item span:first-child {
        display: block;
        color: #94a3b8;
        font-size: 0.75rem;
        font-weight: 500;
        margin-bottom: 0.25rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .balance-item span:last-child {
        font-weight: 600;
        font-size: 0.875rem;
        color: #f8fafc;
      }

      /* Total Sections */
      .totals-section .section-content {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1rem;
      }

      .total-row {
        display: contents;
      }

      .total-item {
        background: rgba(15, 23, 42, 0.4);
        padding: 0.75rem;
        border-radius: 0.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .total-item span:first-child {
        color: #94a3b8;
        font-size: 0.875rem;
      }

      .total-item span:last-child {
        font-weight: 600;
        color: #f8fafc;
      }

      /* Color coding for numbers */
      .num-up {
        color: #10b981 !important;
      }

      .num-down {
        color: #ef4444 !important;
      }

      .num-flat {
        color: #94a3b8 !important;
      }

      .num-emphasis {
        font-weight: 600;
      }

      /* Enhanced Comments Section */
      .comments-section {
        background: rgba(15, 23, 42, 0.5);
        border-radius: 0.75rem;
        padding: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.05);
      }

      .comments-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1rem;
      }

      .comments-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.875rem;
        font-weight: 500;
        color: #cbd5e1;
      }

      .count-chip {
        background: #3b82f6;
        color: white;
        font-size: 0.75rem;
        padding: 0.25rem 0.5rem;
        border-radius: 1rem;
        font-weight: 500;
      }

      .comment-form {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .comment-input {
        flex: 1;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-radius: 0.5rem;
        padding: 0.5rem 0.75rem;
        color: #f8fafc;
        font-size: 0.875rem;
        transition: all 0.2s;
      }

      .comment-input:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .comment-input::placeholder {
        color: #64748b;
      }

      .send-btn {
        background: #3b82f6;
        border: none;
        border-radius: 0.5rem;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        cursor: pointer;
        transition: all 0.2s;
      }

      .send-btn:hover {
        background: #2563eb;
        transform: scale(1.05);
      }

      .send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .char-counter {
        font-size: 0.75rem;
        color: #94a3b8;
        margin-left: 0.5rem;
      }

      .char-counter.over {
        color: #ef4444;
      }

      .comment-empty {
        text-align: center;
        color: #64748b;
        padding: 1rem;
        font-size: 0.875rem;
      }

      .comment-empty i {
        display: block;
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
      }

      .comment-item {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 0.75rem;
        margin-bottom: 0.5rem;
        background: rgba(30, 41, 59, 0.3);
        border-radius: 0.5rem;
      }

      .comment-item.is-optimistic {
        opacity: 0.6;
      }

      .comment-left {
        display: flex;
        gap: 0.75rem;
        flex: 1;
      }

      .comment-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #3b82f6;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 0.875rem;
        font-weight: 500;
        flex-shrink: 0;
      }

      .comment-body {
        flex: 1;
        min-width: 0;
      }

      .comment-head {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.25rem;
      }

      .comment-user {
        font-weight: 500;
        color: #f8fafc;
        font-size: 0.875rem;
      }

      .comment-date {
        color: #94a3b8;
        font-size: 0.75rem;
      }

      .comment-text {
        color: #cbd5e1;
        font-size: 0.875rem;
        line-height: 1.4;
        word-wrap: break-word;
      }

      .comment-delete {
        background: rgba(148, 163, 184, 0.1);
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: #94a3b8;
        cursor: pointer;
        padding: 0.5rem;
        border-radius: 0.375rem;
        transition: all 0.2s;
        flex-shrink: 0;
        min-width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .comment-delete:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.3);
        transform: scale(1.05);
      }

      .comment-delete:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
      }

      .show-all-btn {
        background: transparent;
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: #3b82f6;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        cursor: pointer;
        font-size: 0.875rem;
        margin-bottom: 1rem;
        transition: all 0.2s;
      }

      .show-all-btn:hover {
        background: rgba(59, 130, 246, 0.1);
        border-color: rgba(59, 130, 246, 0.3);
      }

      /* Action Buttons */
      .action-buttons-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        margin-left: 1rem;
        align-self: flex-start;
      }

      .action-button {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        color: #3b82f6;
        padding: 0.75rem;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
        font-weight: 500;
        min-width: 60px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .action-button:hover {
        background: rgba(59, 130, 246, 0.2);
        transform: translateX(-2px);
        border-color: rgba(59, 130, 246, 0.4);
      }

      /* Update Animation */
      .card-updated {
        animation: cardUpdatePulse 1s ease-in-out;
      }

      .card-updated::after {
        content: '';
        position: absolute;
        top: 1rem;
        right: 1rem;
        width: 10px;
        height: 10px;
        background: #10b981;
        border-radius: 50%;
        animation: updatePulse 2s infinite;
        z-index: 10;
      }

      @keyframes cardUpdatePulse {
        0% { 
          background-color: rgba(30, 41, 59, 0.95);
        }
        50% { 
          background-color: rgba(59, 130, 246, 0.1);
          border-color: rgba(59, 130, 246, 0.3);
        }
        100% { 
          background-color: rgba(30, 41, 59, 0.95);
        }
      }

      @keyframes updatePulse {
        0%, 100% {
          transform: scale(1);
          opacity: 1;
        }
        50% {
          transform: scale(1.4);
          opacity: 0.7;
        }
      }

      /* Error and Loading States */
      .error-banner {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #fecaca;
        padding: 1rem;
        border-radius: 0.5rem;
        margin-bottom: 1.5rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .retry-button {
        background: rgba(239, 68, 68, 0.2);
        border: none;
        color: #fecaca;
        padding: 0.5rem 1rem;
        border-radius: 0.25rem;
        cursor: pointer;
        font-size: 0.875rem;
        transition: all 0.2s;
      }

      .retry-button:hover {
        background: rgba(239, 68, 68, 0.3);
      }

      .loading-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 400px;
      }

      .loading-spinner {
        text-align: center;
      }

      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid rgba(59, 130, 246, 0.1);
        border-top: 3px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin: 0 auto 1rem;
      }

      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .no-data {
        grid-column: 1 / -1;
        text-align: center;
        padding: 4rem 2rem;
        background: rgba(30, 41, 59, 0.5);
        border-radius: 1rem;
        border: 1px solid rgba(148, 163, 184, 0.1);
      }

      .no-data h3 {
        font-size: 1.5rem;
        margin-bottom: 0.5rem;
        color: #f8fafc;
      }

      .no-data p {
        color: #94a3b8;
        margin-bottom: 1.5rem;
      }

      .auth-button {
        background: #3b82f6;
        color: white;
        border: none;
        padding: 0.75rem 1.5rem;
        border-radius: 0.5rem;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }

      .auth-button:hover {
        background: #2563eb;
        transform: translateY(-1px);
      }

      /* Utility Classes */
      .flex {
        display: flex;
      }

      .flex-1 {
        flex: 1;
      }

      .items-center {
        align-items: center;
      }

      .space-x-3 > * + * {
        margin-left: 0.75rem;
      }

      .text-center {
        text-align: center;
      }

      .py-12 {
        padding-top: 3rem;
        padding-bottom: 3rem;
      }

      .mt-4 {
        margin-top: 1rem;
      }

      .mb-4 {
        margin-bottom: 1rem;
      }

      .mr-2 {
        margin-right: 0.5rem;
      }

      .text-4xl {
        font-size: 2.25rem;
      }

      .text-gray-300 {
        color: #d1d5db;
      }

      /* Responsive Design */
      @media (max-width: 1200px) {
        .cards-grid {
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        }
      }

      @media (max-width: 768px) {
        .live-dashboard {
          padding: 1rem;
        }
        
        .cards-grid {
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        
        .trading-card {
          padding: 1rem;
        }
        
        .card-metrics {
          grid-template-columns: 1fr;
        }
        
        .order-info {
          grid-template-columns: 1fr;
        }
        
        .balance-info {
          grid-template-columns: 1fr 1fr;
        }
        
        .action-buttons-container {
          flex-direction: row;
          margin-left: 0;
          margin-top: 1rem;
        }
        
        .action-button {
          flex: 1;
        }
        
        .totals-section .section-content {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 480px) {
        .balance-info {
          grid-template-columns: 1fr;
        }
        
        .card-header {
          flex-direction: column;
          align-items: flex-start;
          gap: 1rem;
        }
        
        .profit-display {
          text-align: left;
          width: 100%;
        }
      }
    `;

    const styleSheet = document.createElement("style");
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
    return () => styleSheet.remove();
  }, []);

  if (loading && list.length === 0) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">
          <div className="spinner" />
          <p>Loading live trading data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="live-dashboard">
      {errorMessage && (
        <div className="error-banner">
          <span>{errorMessage}</span>
          <button onClick={() => setError('')} className="retry-button">
            Dismiss
          </button>
        </div>
      )}

      {/* Header with Export Button */}
      <div className="data-container mb-4">
        <div className="p-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold">Today's Live Trading Data</h2>
            <p className="text-sm text-gray-600 mt-1">
              Showing data for {new Date().toLocaleDateString('en-US', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="cards-grid">
        {list.length === 0 ? (
          <div className="no-data">
            <div className="text-center py-12">
              <i className="fas fa-inbox text-gray-300 text-4xl mb-4" />
              <h3>No Live Data Available</h3>
              <p>No trading data found. Check your connection and try again.</p>
              <button onClick={refreshData} className="auth-button mt-4">
                <i className="fas fa-refresh mr-2" />
                Retry
              </button>
            </div>
          </div>
        ) : (
          list.map((item) => (
            <TradingCard
              key={item.symbol_ref}
              item={item}
              comments={commentsMap[item.symbol_ref] || []}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
              isAddingComment={addCommentMutation.isLoading}
              isDeletingComment={deleteCommentMutation.isLoading}
              customName={customNamesData[item.symbol_ref]}
              onSaveCustomName={handleSaveCustomName}
              onDeleteCustomName={handleDeleteCustomName}
              isSavingCustomName={saveCustomNameMutation.isLoading}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default DailySavedDataPage;
