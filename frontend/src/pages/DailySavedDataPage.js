import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
// websockets replaced by polling
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
      await axios.post('/api/comments/delete', { id });
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
  subUsers: {
    getBySymbol: async (symbolRef) => {
      const res = await axios.get(`/api/sub-users/by-symbol/${symbolRef}`);
      return res.data;
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

const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const formatDate = (dateString) => {
  if (!dateString && dateString !== 0) return '';
  try {
    let d;

    // If it's already a Date
    if (dateString instanceof Date) {
      d = dateString;
    }

    // If looks like ISO8601, parse directly (avoid treating as unix seconds)
    else if (typeof dateString === 'string' && ISO_RE.test(dateString)) {
      d = new Date(dateString);
    }

    // Numeric values (number or numeric-string) - detect seconds vs ms
    else if (typeof dateString === 'number' || /^\d+$/.test(String(dateString))) {
      const n = Number(dateString);
      // Heuristic: values <= 1e10 are seconds, >1e10 are milliseconds
      if (n <= 1e10) {
        d = new Date(n * 1000);
      } else {
        d = new Date(n);
      }
    } else {
      // Fallback - let Date try to parse
      d = new Date(dateString);
    }

    if (Number.isNaN(d.getTime())) return String(dateString);

    // Include year to avoid ambiguity in logs like "Jan 21, 1970, 15:18:30"
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return String(dateString);
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

const useLiveData = (userId) => {
  const [lastTimestamps, setLastTimestamps] = useState({});
  const lastTimestampsRef = React.useRef({});
  
  const fetchLiveData = useCallback(async () => {
    try {
      console.log('🔄 Fetching live data...');
      const newData = await api.liveData.fetch();
      console.log('✅ Got live data:', newData?.length || 0, 'records');
      
      const processedData = Array.isArray(newData) ? newData : (newData?.rows || []);

      // Compute new timestamps map
      const newTimestamps = processedData.reduce((acc, item) => {
        acc[item.symbol_ref] = item.timestamp;
        return acc;
      }, {});

      // Detect changed symbols compared to last known timestamps (use Set for stable boolean checks)
      const prev = lastTimestampsRef.current || {};
      const changedArray = Object.keys(newTimestamps).filter((symbol) => newTimestamps[symbol] !== prev[symbol]);
      const changedSet = new Set(changedArray);
      if (changedArray.length > 0) {
        console.log('📊 Data updated for symbols:', changedArray);
      }

      // Update refs/state
      lastTimestampsRef.current = newTimestamps;
      setLastTimestamps(newTimestamps);

      // Mark items as updated when their timestamp changed so React sees new objects and re-renders
      const annotated = processedData.map((item) => ({
        ...item,
        // Ensure isUpdated is always a boolean (true when changed, false otherwise)
        isUpdated: Boolean(changedSet.has(item.symbol_ref)),
      }));

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('🧾 useLiveData annotated sample:', annotated.slice(0, 6));
      }

      return annotated;
    } catch (error) {
      console.error('❌ Error fetching live data:', error);
      throw error;
    }
  }, []);

  const query = useQuery({
    queryKey: ['liveData', userId],
    queryFn: fetchLiveData,
    // Disable react-query internal polling - we control polling via refreshData to avoid races
    refetchInterval: false,
    staleTime: 0, // Never consider data fresh - always refetch
    gcTime: 30000, // Keep in cache for 30 seconds
    placeholderData: (prev) => prev,
    enabled: !!userId,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
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
  const [hasAlertedTooLong, setHasAlertedTooLong] = useState(false);
  
  const overflow = comments.length > 3;
  const visible = showAll ? comments : comments.slice(-3);
  const remaining = MAX_COMMENT_LEN - value.length;
  const tooLong = remaining < 0;

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!value.trim()) return;
    if (tooLong) {
      window.alert(`Comment is too long. Max ${MAX_COMMENT_LEN} characters.`);
      return;
    }
    onAddComment({ symbolRef, text: value.trim() });
    setValue('');
    setHasAlertedTooLong(false);
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

  // One-time alert when crossing the limit while typing
  useEffect(() => {
    const isOver = value.length > MAX_COMMENT_LEN;
    if (isOver && !hasAlertedTooLong) {
      setHasAlertedTooLong(true);
      window.alert(`Comment is too long. Max ${MAX_COMMENT_LEN} characters.`);
    }
    if (!isOver && hasAlertedTooLong) {
      setHasAlertedTooLong(false);
    }
  }, [value, hasAlertedTooLong]);

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

// SubUsernames component
const SubUsernames = React.memo(({ symbolRef, isVisible, onClose }) => {
  const { data: subUsersResponse, isLoading, error } = useQuery({
    queryKey: ['subUsers', symbolRef],
    queryFn: () => api.subUsers.getBySymbol(symbolRef),
    enabled: isVisible && Boolean(symbolRef),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: GC_TIME,
  });

  const subUsers = subUsersResponse?.data || [];

  if (!isVisible) return null;

  return (
    <div className="sub-users-modal">
      <div className="sub-users-overlay" onClick={onClose} />
      <div className="sub-users-content">
        <div className="sub-users-header">
          <h3>Users for {symbolRef}</h3>
          <button onClick={onClose} className="close-btn" aria-label="Close">
            <i className="fas fa-times" />
          </button>
        </div>
        
        <div className="sub-users-body">
          {isLoading && (
            <div className="loading-state">
              <div className="spinner-small" />
              <span>Loading users...</span>
            </div>
          )}
          
          {error && (
            <div className="error-state">
              <i className="fas fa-exclamation-triangle" />
              <span>Failed to load users</span>
            </div>
          )}
          
          {!isLoading && !error && (
            <>
              {subUsers.length === 0 ? (
                <div className="empty-state">
                  <i className="fas fa-users" />
                  <span>No users found for this symbol</span>
                </div>
              ) : (
                <div className="sub-users-list">
                  <div className="sub-users-count">
                    {subUsers.length} user{subUsers.length !== 1 ? 's' : ''} found
                  </div>
                  <div className="users-list-container">
                    {subUsers.map((subUser, index) => (
                      <div key={subUser.sub_username || index} className="user-list-item">
                        <div className="user-avatar">
                          {getInitials(subUser.sub_username)}
                        </div>
                        <div className="user-details">
                          <div className="user-name">{subUser.sub_username}</div>
                          <div className="user-meta">
                            <span className={`user-status ${subUser.status === 'active' ? 'active' : 'inactive'}`}>
                              {subUser.status}
                            </span>
                            {subUser.created_at && (
                              <span className="user-join-date">
                                Joined {new Date(subUser.created_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="user-actions">
                          <i className="fas fa-chevron-right" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});

SubUsernames.displayName = 'SubUsernames';

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
  const [showSubUsers, setShowSubUsers] = useState(false);
  // Normalize timestamp for display: prefer `item.timestamp`, fall back to `item.date`.
  // Convert numeric-strings (e.g. '1757911190') to Number so `formatDate` heuristics work predictably.
  const rawTs = item.timestamp ?? item.date;
  let displayTimestamp = rawTs;
  if (typeof rawTs === 'string' && /^\d+$/.test(rawTs)) {
    displayTimestamp = Number(rawTs);
  }
  // Local state to ensure DOM updates when timestamp changes
  const [displayTsState, setDisplayTsState] = useState(displayTimestamp);

  useEffect(() => {
    if (displayTimestamp !== displayTsState) {
      setDisplayTsState(displayTimestamp);
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('➡️ TradingCard local timestamp updated for', item.symbol_ref, '->', displayTimestamp);
      }
    }
  }, [displayTimestamp, displayTsState, item.symbol_ref]);
  // Debug render: log when a card renders (only in development)
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    if (typeof item.isUpdated === 'undefined') {
      console.log('⚠️ TradingCard missing isUpdated for', item.symbol_ref, 'typeof=', typeof item.isUpdated, 'item=', item);
    }
    console.log('🔁 Rendering TradingCard for', item.symbol_ref, 'isUpdated=', Boolean(item.isUpdated), 'timestamp=', displayTsState);
  }

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
              {/* Prefer live numeric timestamp when available so UI updates on polling */}
              <p className="symbol-date">{formatDate(displayTsState)}</p>
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

        {/* See More Button */}
        <div className="card-actions">
          <button 
            onClick={() => setShowSubUsers(true)}
            className="see-more-btn"
            title="View users for this symbol"
          >
            <i className="fas fa-users" />
            <span>See Users</span>
          </button>
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

      {/* Users Modal */}
      <SubUsernames 
        symbolRef={item.symbol_ref}
        isVisible={showSubUsers}
        onClose={() => setShowSubUsers(false)}
      />

      {/* Action Buttons removed from card-level; now controlled at page header */}
    </div>
  );
});

TradingCard.displayName = 'TradingCard';

// Main component
const DailySavedDataPage = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // Live polling toggle (default off). Initial data still loads once via react-query.
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [errorMessage, setError] = useState('');
  const [currentUserId, setCurrentUserId] = useState(user?.id);

  const refreshData = useCallback(async () => {
    try {
      console.log('🔁 refreshData called - fetching fresh live data for user', user?.id);
      if (!user?.id) {
        console.warn('refreshData skipped - no user id');
        return;
      }

      // Fetch raw live data directly from API
      const raw = await api.liveData.fetch();
      const processedData = Array.isArray(raw) ? raw : (raw?.rows || []);

      // Build new timestamps map from fresh data
      const newTimestamps = processedData.reduce((acc, item) => {
        acc[item.symbol_ref] = item.timestamp;
        return acc;
      }, {});

      // Read previous cached data to compute changed symbols
      const prevCached = queryClient.getQueryData(['liveData', user?.id]) || [];
      const prevArray = Array.isArray(prevCached) ? prevCached : (prevCached?.rows || []);
      const prevTimestamps = prevArray.reduce((acc, item) => {
        if (item && item.symbol_ref) acc[item.symbol_ref] = item.timestamp;
        return acc;
      }, {});

      const changedArray = Object.keys(newTimestamps).filter((s) => newTimestamps[s] !== prevTimestamps[s]);
      const changedSet = new Set(changedArray);
      if (changedArray.length > 0) {
        console.log('📊 refreshData detected changes for symbols:', changedArray);
      }

      // Annotate items and update cache atomically
      const annotated = processedData.map((item) => ({
        ...item,
        isUpdated: Boolean(changedSet.has(item.symbol_ref)),
      }));

      // Write annotated array into react-query cache for the liveData key
      queryClient.setQueryData(['liveData', user?.id], annotated);

      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.log('🧾 refreshData annotated sample (written to cache):', annotated.slice(0, 6));
      }
    } catch (err) {
      console.error('Error in refreshData fetch/set cache', err);
    }
  }, [queryClient, user?.id]);

  // Start/stop polling based on toggle. Initial data loaded by react-query separately.
  useEffect(() => {
    if (!user?.id || !autoRefresh) return;

    const POLL_INTERVAL = Number(process.env.REACT_APP_POLL_INTERVAL_MS) || 3000;
    let timer = null;

    (async () => {
      try {
        console.log('▶️ starting polling loop, interval:', POLL_INTERVAL);
        await refreshData();
        setLastUpdated(new Date());
      } catch {}
      timer = setInterval(() => {
        try {
          refreshData();
          setLastUpdated(new Date());
        } catch {}
      }, POLL_INTERVAL);
    })();

    return () => { if (timer) clearInterval(timer); };
  }, [user?.id, autoRefresh, refreshData]);

useEffect(() => {
  if (user?.id !== currentUserId) {
    // Clear all live data and comments as they are user-specific
    queryClient.removeQueries({ queryKey: ['liveData', currentUserId] });
    queryClient.removeQueries({ queryKey: ['comments'] });
    
    // Only clear symbol names if switching between different user types
    const previousUserType = currentUserId ? 'unknown' : null;
    if (previousUserType !== user?.user_type) {
      queryClient.removeQueries({ queryKey: ['symbolNames'] });
    }
    
    setCurrentUserId(user?.id);
  }
}, [user?.id, currentUserId, queryClient]);

  // Data fetching with user-specific cache keys
  const { data, isLoading: loading, error, refetch } = useLiveData(user?.id);

  // Normalize live data to an array
  const list = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
  }, [data]);

  // Debug: log a sample of the list to ensure items are annotated as expected
  useEffect(() => {
    if (list.length > 0 && process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log('🧾 DailySavedDataPage list sample:', list.slice(0, 3));
    }
  }, [list]);

  // Fetch comments for all symbols
  const symbolRefs = useMemo(() => list.map((item) => item.symbol_ref), [list]);
  const commentsQueries = useAllSymbolComments(symbolRefs, user?.id);
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
        /* Robust wrapping for long words/URLs and preserving newlines */
        white-space: pre-wrap;
        word-break: break-word;
        overflow-wrap: anywhere;
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

      /* Card Actions */
      .card-actions {
        margin-bottom: 1.5rem;
        display: flex;
        justify-content: flex-end;
      }

      .see-more-btn {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        color: #3b82f6;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 500;
      }

      .see-more-btn:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.3);
        transform: translateY(-1px);
      }

      .see-more-btn:active {
        transform: translateY(0);
      }

      /* Sub Users Modal */
      .sub-users-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        animation: fadeIn 0.3s ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .sub-users-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(8px);
        cursor: pointer;
      }

      .sub-users-content {
        background: linear-gradient(145deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.98));
        backdrop-filter: blur(20px);
        border: 1px solid rgba(148, 163, 184, 0.2);
        border-radius: 1.25rem;
        max-width: 700px;
        width: 100%;
        max-height: 85vh;
        overflow: hidden;
        box-shadow: 
          0 25px 50px -12px rgba(0, 0, 0, 0.6),
          0 0 0 1px rgba(255, 255, 255, 0.05),
          inset 0 1px 0 rgba(255, 255, 255, 0.1);
        position: relative;
        z-index: 1001;
        animation: slideUp 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .sub-users-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 2rem 2rem 1rem 2rem;
        border-bottom: 1px solid rgba(148, 163, 184, 0.15);
        background: linear-gradient(90deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.1));
        position: relative;
      }

      .sub-users-header::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.5), transparent);
      }

      .sub-users-header h3 {
        color: #f8fafc;
        font-size: 1.5rem;
        font-weight: 700;
        margin: 0;
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .sub-users-header h3::before {
        content: '';
        width: 4px;
        height: 24px;
        background: linear-gradient(135deg, #3b82f6, #10b981);
        border-radius: 2px;
      }

      .close-btn {
        background: rgba(148, 163, 184, 0.1);
        border: 1px solid rgba(148, 163, 184, 0.2);
        color: #94a3b8;
        cursor: pointer;
        padding: 0.75rem;
        border-radius: 0.75rem;
        transition: all 0.3s ease;
        width: 44px;
        height: 44px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.1rem;
      }

      .close-btn:hover {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.15);
        border-color: rgba(239, 68, 68, 0.3);
        transform: scale(1.05);
      }

      .sub-users-body {
        padding: 2rem;
        max-height: calc(85vh - 120px);
        overflow-y: auto;
      }

      .sub-users-body::-webkit-scrollbar {
        width: 6px;
      }

      .sub-users-body::-webkit-scrollbar-track {
        background: rgba(148, 163, 184, 0.1);
        border-radius: 3px;
      }

      .sub-users-body::-webkit-scrollbar-thumb {
        background: rgba(59, 130, 246, 0.4);
        border-radius: 3px;
      }

      .sub-users-body::-webkit-scrollbar-thumb:hover {
        background: rgba(59, 130, 246, 0.6);
      }

      .loading-state, .error-state, .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 3rem 2rem;
        text-align: center;
        color: #94a3b8;
      }

      .loading-state i, .error-state i, .empty-state i {
        font-size: 3rem;
        margin-bottom: 1rem;
        opacity: 0.7;
      }

      .error-state {
        color: #fca5a5;
      }

      .error-state i {
        color: #ef4444;
      }

      .empty-state i {
        color: #6b7280;
      }

      .spinner-small {
        width: 32px;
        height: 32px;
        border: 3px solid rgba(59, 130, 246, 0.1);
        border-top: 3px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
      }

      .sub-users-count {
        color: #e2e8f0;
        font-size: 1rem;
        margin-bottom: 1.5rem;
        text-align: center;
        font-weight: 600;
        padding: 0.75rem 1.5rem;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 0.75rem;
        backdrop-filter: blur(10px);
      }

      .users-list-container {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }

      .user-list-item {
        display: flex;
        align-items: center;
        padding: 1rem 1.25rem;
        background: rgba(15, 23, 42, 0.3);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-radius: 0.75rem;
        transition: all 0.3s ease;
        cursor: pointer;
        position: relative;
        overflow: hidden;
      }

      .user-list-item::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: linear-gradient(180deg, #3b82f6, #10b981);
        transform: scaleY(0);
        transition: transform 0.3s ease;
      }

      .user-list-item:hover {
        background: rgba(30, 41, 59, 0.6);
        border-color: rgba(59, 130, 246, 0.3);
        transform: translateX(4px);
      }

      .user-list-item:hover::before {
        transform: scaleY(1);
      }

      .user-avatar {
        width: 44px;
        height: 44px;
        border-radius: 50%;
        background: linear-gradient(135deg, #3b82f6, #06b6d4);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 0.95rem;
        font-weight: 700;
        flex-shrink: 0;
        margin-right: 1rem;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
        transition: all 0.3s ease;
      }

      .user-list-item:hover .user-avatar {
        transform: scale(1.05);
        box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);
      }

      .user-details {
        flex: 1;
        min-width: 0;
      }

      .user-name {
        color: #f8fafc;
        font-size: 1.1rem;
        font-weight: 600;
        margin-bottom: 0.25rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .user-meta {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
      }

      .user-status {
        font-size: 0.8rem;
        font-weight: 600;
        padding: 0.25rem 0.75rem;
        border-radius: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
      }

      .user-status::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }

      .user-status.active {
        background: rgba(16, 185, 129, 0.2);
        color: #10b981;
        border: 1px solid rgba(16, 185, 129, 0.4);
      }

      .user-status.inactive {
        background: rgba(239, 68, 68, 0.2);
        color: #ef4444;
        border: 1px solid rgba(239, 68, 68, 0.4);
      }

      .user-join-date {
        color: #94a3b8;
        font-size: 0.875rem;
        font-weight: 500;
      }

      .user-actions {
        color: #64748b;
        font-size: 0.875rem;
        transition: all 0.3s ease;
        opacity: 0.6;
      }

      .user-list-item:hover .user-actions {
        color: #3b82f6;
        opacity: 1;
        transform: translateX(2px);
      }

      /* Responsive adjustments for modal */
      @media (max-width: 768px) {
        .sub-users-modal {
          padding: 0.5rem;
        }
        
        .sub-users-content {
          max-height: 95vh;
          border-radius: 1rem;
        }

        .sub-users-header {
          padding: 1.5rem 1.5rem 1rem 1.5rem;
        }

        .sub-users-header h3 {
          font-size: 1.25rem;
        }

        .sub-users-body {
          padding: 1.5rem;
        }

        .user-list-item {
          padding: 0.875rem 1rem;
        }

        .user-avatar {
          width: 40px;
          height: 40px;
          font-size: 0.875rem;
          margin-right: 0.875rem;
        }

        .user-name {
          font-size: 1rem;
        }

        .user-meta {
          gap: 0.75rem;
        }
        
        .card-actions {
          justify-content: center;
        }
      }

      @media (max-width: 480px) {
        .sub-users-header {
          padding: 1rem;
        }

        .sub-users-body {
          padding: 1rem;
        }

        .user-list-item {
          padding: 0.75rem;
        }

        .user-meta {
          flex-direction: column;
          align-items: flex-start;
          gap: 0.5rem;
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
          <div className="flex gap-2">
            <button className="auth-button-secondary" onClick={refreshData} title="Fetch latest now">
              <i className="fas fa-rotate-right mr-2" /> Refresh
            </button>
            <button
              className="auth-button"
              onClick={() => setAutoRefresh(v => !v)}
              title="Toggle 3s live polling"
            >
              <i className={`fas ${autoRefresh ? 'fa-pause' : 'fa-play'} mr-2`} />
              {autoRefresh ? 'Live: On' : 'Live: Off'}
            </button>
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
          list.map((item) => {
            // Defensive normalization: ensure isUpdated is always a boolean and key uses stringified timestamp
            const keyTs = String(item.timestamp ?? item.date ?? '');
            const safeItem = { ...item, isUpdated: Boolean(item.isUpdated) };
            return (
              <TradingCard
                key={`${item.symbol_ref}-${keyTs}`}
                item={safeItem}
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
            );
          })
        )}
      </div>
    </div>
  );
};

export default DailySavedDataPage;
