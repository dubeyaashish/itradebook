const checkAuth = (req, res, next) => {
    // Temporary: Skip auth check for development
    req.session = {
        user_id: 1,
        user_type: 'admin',
        logged_in: true
    };
    next();
};

module.exports = {
    checkAuth
};
