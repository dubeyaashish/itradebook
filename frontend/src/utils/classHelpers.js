export const getProfitClass = (value) => {
    const num = Number(value);
    if (num > 0) return 'text-green-600 font-semibold';
    if (num < 0) return 'text-red-600 font-semibold';
    return 'text-gray-700';
};

export const getBalanceClass = (value) => {
    const num = Number(value);
    if (num > 0) return 'text-blue-600 font-semibold';
    if (num < 0) return 'text-orange-600 font-semibold';
    return 'text-gray-700';
};
