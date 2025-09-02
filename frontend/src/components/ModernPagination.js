import React from 'react';

const ModernPagination = ({ 
  currentPage = 1, 
  totalPages = 1, 
  totalRecords = 0,
  recordsPerPage = 50,
  onPageChange, 
  showRecordsInfo = true,
  showFirstLast = true,
  maxVisiblePages = 5,
  className = ""
}) => {
  if (totalPages <= 1) return null;

  const getVisiblePages = () => {
    const pages = [];
    const halfVisible = Math.floor(maxVisiblePages / 2);
    
    let startPage = Math.max(1, currentPage - halfVisible);
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  };

  const visiblePages = getVisiblePages();
  
  const buttonBaseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px 12px',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '8px',
    transition: 'all 0.2s ease-in-out',
    cursor: 'pointer',
    borderWidth: '1px',
    borderStyle: 'solid',
    outline: 'none',
    textDecoration: 'none',
    minWidth: '44px', // Improved touch target
    minHeight: '44px', // Improved touch target
    width: 'auto'
  };

  const secondaryButtonStyle = {
    ...buttonBaseStyle,
    backgroundColor: '#334155', // --bg-tertiary
    color: '#f1f5f9', // --text-primary
    borderColor: '#475569', // --border-color
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  };

  const secondaryButtonHoverStyle = {
    backgroundColor: '#475569',
    borderColor: '#64748b',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    transform: 'scale(1.05)',
  };

  const secondaryButtonDisabledStyle = {
    backgroundColor: '#1e293b',
    color: '#64748b', // --text-muted
    borderColor: '#334155',
    cursor: 'not-allowed',
  };

  const currentPageStyle = {
    ...buttonBaseStyle,
    backgroundColor: '#3b82f6', // --accent-primary
    color: 'white',
    borderWidth: '2px',
    borderColor: '#3b82f6',
    cursor: 'default',
    fontWeight: '600',
    boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)',
  };

  const pageButtonStyle = {
    ...buttonBaseStyle,
    backgroundColor: '#334155', // --bg-tertiary
    color: '#f1f5f9', // --text-primary
    borderColor: '#475569', // --border-color
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  };

  const pageButtonHoverStyle = {
    backgroundColor: '#1e293b',
    color: '#3b82f6', // --accent-primary
    borderColor: '#3b82f6',
    transform: 'scale(1.05)',
  };

  const startRecord = (currentPage - 1) * recordsPerPage + 1;
  const endRecord = Math.min(currentPage * recordsPerPage, totalRecords);

  const containerStyle = {
    backgroundColor: '#1e293b', // --bg-secondary
    borderTop: '1px solid #475569', // --border-color
    padding: '12px 16px', // Reduced padding for mobile
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  };

  const desktopContainerStyle = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px'
  };

  const paginationControlsStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '2px', // Tighter spacing for mobile
    flexWrap: 'wrap',
    justifyContent: 'center'
  };

  const infoStyle = {
    fontSize: '14px',
    color: '#f1f5f9', // --text-primary
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  const highlightStyle = {
    fontWeight: '600',
    color: '#cbd5e1' // --text-secondary
  };

  const badgeStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: '500',
    backgroundColor: '#334155', // --bg-tertiary
    color: '#3b82f6' // --accent-primary
  };

  const PaginationButton = ({ children, onClick, disabled, style, hoverStyle, disabledStyle, title }) => {
    const [isHovered, setIsHovered] = React.useState(false);
    
    const buttonStyle = disabled 
      ? { ...style, ...disabledStyle }
      : isHovered 
        ? { ...style, ...hoverStyle }
        : style;

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={buttonStyle}
        title={title}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}
      </button>
    );
  };

  // Add responsive styling based on screen size
  const isMobile = window.innerWidth <= 768;
  const isSmallMobile = window.innerWidth <= 480;

  const responsiveContainerStyle = {
    ...containerStyle,
    padding: isSmallMobile ? '8px 12px' : isMobile ? '12px 16px' : '16px 24px'
  };

  const responsivePaginationControlsStyle = {
    ...paginationControlsStyle,
    gap: isSmallMobile ? '1px' : '2px',
    flexWrap: 'wrap',
    justifyContent: isMobile ? 'center' : 'flex-start'
  };

  const responsiveButtonStyle = {
    ...buttonBaseStyle,
    padding: isSmallMobile ? '6px 8px' : '8px 12px',
    fontSize: isSmallMobile ? '12px' : '14px',
    minWidth: isSmallMobile ? '36px' : '44px',
    minHeight: isSmallMobile ? '36px' : '44px'
  };

  // Update button styles with responsive values
  const mobileSecondaryButtonStyle = { ...secondaryButtonStyle, ...responsiveButtonStyle };
  const mobileCurrentPageStyle = { ...currentPageStyle, ...responsiveButtonStyle };
  const mobilePageButtonStyle = { ...pageButtonStyle, ...responsiveButtonStyle };

  return (
    <div style={{ ...responsiveContainerStyle }} className={className}>
      
      {/* Desktop Layout */}
      <div style={desktopContainerStyle}>
        
        {/* Records Info */}
        {showRecordsInfo && (
          <div style={infoStyle}>
            <span>
              Showing <span style={highlightStyle}>{startRecord.toLocaleString()}</span> to{' '}
              <span style={highlightStyle}>{endRecord.toLocaleString()}</span> of{' '}
              <span style={highlightStyle}>{totalRecords.toLocaleString()}</span> results
            </span>
            <span style={badgeStyle}>
              Page {currentPage} of {totalPages}
            </span>
          </div>
        )}

        {/* Pagination Controls */}
        <div style={responsivePaginationControlsStyle}>
          
          {/* First Page */}
          {showFirstLast && currentPage > 3 && !isSmallMobile && (
            <>
              <PaginationButton
                onClick={() => onPageChange(1)}
                style={mobileSecondaryButtonStyle}
                hoverStyle={secondaryButtonHoverStyle}
                title="First Page"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </PaginationButton>
              {visiblePages[0] > 1 && (
                <span style={{ padding: '0 4px', color: '#6b7280', fontSize: isSmallMobile ? '10px' : '12px' }}>...</span>
              )}
            </>
          )}

          {/* Previous Page */}
          <PaginationButton
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            style={mobileSecondaryButtonStyle}
            hoverStyle={secondaryButtonHoverStyle}
            disabledStyle={secondaryButtonDisabledStyle}
            title="Previous Page"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </PaginationButton>

          {/* Page Numbers - Show fewer on mobile */}
          {(isSmallMobile ? visiblePages.slice(0, 3) : visiblePages).map(page => (
            <PaginationButton
              key={page}
              onClick={() => onPageChange(page)}
              style={page === currentPage ? mobileCurrentPageStyle : mobilePageButtonStyle}
              hoverStyle={page === currentPage ? {} : pageButtonHoverStyle}
              title={`Go to page ${page}`}
            >
              {page}
            </PaginationButton>
          ))}

          {/* Next Page */}
          <PaginationButton
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            style={mobileSecondaryButtonStyle}
            hoverStyle={secondaryButtonHoverStyle}
            disabledStyle={secondaryButtonDisabledStyle}
            title="Next Page"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </PaginationButton>

          {/* Last Page */}
          {showFirstLast && currentPage < totalPages - 2 && !isSmallMobile && (
            <>
              {visiblePages[visiblePages.length - 1] < totalPages && (
                <span style={{ padding: '0 4px', color: '#6b7280', fontSize: isSmallMobile ? '10px' : '12px' }}>...</span>
              )}
              <PaginationButton
                onClick={() => onPageChange(totalPages)}
                style={mobileSecondaryButtonStyle}
                hoverStyle={secondaryButtonHoverStyle}
                title="Last Page"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
              </PaginationButton>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModernPagination;
