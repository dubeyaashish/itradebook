// Dark theme styles for react-select components
export const customSelectStyles = {
  control: (provided, state) => ({
    ...provided,
    backgroundColor: '#374151', // Dark gray background
    borderColor: state.isFocused ? '#3B82F6' : '#6B7280', // Blue when focused, gray normally
    borderWidth: '1px',
    borderRadius: '0.375rem',
    boxShadow: state.isFocused ? '0 0 0 3px rgba(59, 130, 246, 0.1)' : 'none',
    color: '#F9FAFB', // Light text
    minHeight: '38px',
    '&:hover': {
      borderColor: state.isFocused ? '#3B82F6' : '#9CA3AF',
    },
  }),
  menu: (provided) => ({
    ...provided,
    backgroundColor: '#374151', // Dark gray background
    border: '1px solid #6B7280',
    borderRadius: '0.375rem',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    zIndex: 99999, // Increased z-index
  }),
  menuPortal: (provided) => ({
    ...provided,
    zIndex: 99999, // Increased z-index
  }),
  option: (provided, state) => ({
    ...provided,
    backgroundColor: state.isSelected 
      ? '#3B82F6' 
      : state.isFocused 
      ? '#4B5563' 
      : 'transparent',
    color: '#F9FAFB',
    cursor: 'pointer',
    padding: '8px 12px',
    '&:active': {
      backgroundColor: '#3B82F6',
    },
  }),
  singleValue: (provided) => ({
    ...provided,
    color: '#F9FAFB', // Light text for selected value
  }),
  multiValue: (provided) => ({
    ...provided,
    backgroundColor: '#3B82F6', // Blue background for selected tags
    borderRadius: '0.25rem',
  }),
  multiValueLabel: (provided) => ({
    ...provided,
    color: '#FFFFFF', // White text for selected tags
    fontSize: '0.875rem',
  }),
  multiValueRemove: (provided) => ({
    ...provided,
    color: '#FFFFFF',
    '&:hover': {
      backgroundColor: '#2563EB', // Darker blue on hover
      color: '#FFFFFF',
    },
  }),
  placeholder: (provided) => ({
    ...provided,
    color: '#9CA3AF', // Gray placeholder text
  }),
  input: (provided) => ({
    ...provided,
    color: '#F9FAFB', // Light text for input
  }),
  indicatorSeparator: (provided) => ({
    ...provided,
    backgroundColor: '#6B7280', // Gray separator
  }),
  dropdownIndicator: (provided, state) => ({
    ...provided,
    color: state.isFocused ? '#3B82F6' : '#9CA3AF',
    '&:hover': {
      color: '#3B82F6',
    },
  }),
  clearIndicator: (provided) => ({
    ...provided,
    color: '#9CA3AF',
    '&:hover': {
      color: '#EF4444', // Red on hover
    },
  }),
  loadingIndicator: (provided) => ({
    ...provided,
    color: '#3B82F6',
  }),
  noOptionsMessage: (provided) => ({
    ...provided,
    color: '#9CA3AF',
  }),
  loadingMessage: (provided) => ({
    ...provided,
    color: '#9CA3AF',
  }),
};

export default customSelectStyles;