const express = require('express');
const { sendEmail } = require('../utils/emailService');

module.exports = function(pool, authenticateToken, bcrypt, jwt) {
    const router = express.Router();

    // Register endpoint
    router.post('/register', async (req, res) => {
        const { username, email, password } = req.body;    if (!username || !email || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();
            
            // Check if user already exists
            const existingUsers = await conn.query(
                'SELECT id FROM users WHERE username = ? OR email = ?',
                [username, email]
            );
            
            if (existingUsers.length > 0) {
                return res.status(400).json({ error: 'Username or email already exists' });
            }

            // Hash password using compatible format
            const saltRounds = 10; // Match PHP's default
            const hashedPassword = await bcrypt.hash(password, saltRounds);
            // Convert to PHP compatible format
            const phpCompatibleHash = hashedPassword.replace('$2a$', '$2y$');

            // Create user
            const result = await conn.query(
                'INSERT INTO users (username, email, password_hash, is_active) VALUES (?, ?, ?, false)',
                [username, email, hashedPassword]
            );

            const userId = Number(result.insertId);

            // Generate OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

            // Store OTP
            await conn.query(
                'INSERT INTO otps (email, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)',
                [email, otp, 'email_verification', expiresAt]
            );

            await conn.commit();

            // Send OTP via email
            const emailSent = await sendEmail(
                email,
                'Verify your iTradeBook account',
                `Your verification code is: ${otp}`,
                `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>Welcome to iTradeBook!</h2>
                    <p>Please use the following code to verify your email address:</p>
                    <h1 style="font-size: 36px; letter-spacing: 5px; text-align: center; padding: 20px; background-color: #f0f0f0; border-radius: 5px;">${otp}</h1>
                    <p>This code will expire in 15 minutes.</p>
                    <p>If you didn't request this verification, please ignore this email.</p>
                </div>
                `
            );

            if (!emailSent) {
                return res.status(201).json({
                    message: 'Account created but verification email could not be sent. Please request a new OTP.',
                    requiresVerification: true,
                    userId,
                    email
                });
            }

            res.status(201).json({
                message: 'Account created successfully. Please check your email for verification code.',
                requiresVerification: true,
                userId,
                email
            });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error('Registration error:', err);
            res.status(500).json({ error: 'Database error during registration' });
        } finally {
            if (conn) conn.release();
        }
    });

    // Verify OTP endpoint
    router.post('/verify-otp', async (req, res) => {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // Get the latest unused OTP for the email
            const otpRecords = await conn.query(
                `SELECT * FROM otps 
                WHERE email = ? AND otp_code = ? AND used = 0 AND purpose = 'email_verification'
                AND expires_at > NOW()
                ORDER BY created_at DESC LIMIT 1`,
                [email, otp]
            );

            if (otpRecords.length === 0) {
                return res.status(400).json({ error: 'Invalid or expired OTP' });
            }

            // Mark OTP as used
            await conn.query(
                'UPDATE otps SET used = 1 WHERE id = ?',
                [otpRecords[0].id]
            );

            // Activate user account
            await conn.query(
                'UPDATE users SET is_active = true WHERE email = ?',
                [email]
            );

            // Get user details
            const users = await conn.query(
                'SELECT id, username, email, user_type FROM users WHERE email = ?',
                [email]
            );

            if (users.length === 0) {
                throw new Error('User not found');
            }

            const user = users[0];

            // Generate JWT token
            const token = jwt.sign(
                { userId: user.id, username: user.username, email: user.email },
                process.env.JWT_SECRET || 'default-secret',
                { expiresIn: '24h' }
            );

            await conn.commit();

            res.json({
                message: 'Email verified successfully',
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    user_type: user.user_type
                }
            });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error('OTP verification error:', err);
            res.status(500).json({ error: 'Database error during OTP verification' });
        } finally {
            if (conn) conn.release();
        }
    });

    // Resend OTP endpoint
    router.post('/resend-otp', async (req, res) => {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            await conn.beginTransaction();

            // Check if user exists and needs verification
            const users = await conn.query(
                'SELECT id, username FROM users WHERE email = ? AND is_active = false',
                [email]
            );

            if (users.length === 0) {
                return res.status(404).json({ error: 'User not found or already verified' });
            }

            // Generate new OTP
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

            // Store new OTP
            await conn.query(
                'INSERT INTO otps (email, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)',
                [email, otp, 'email_verification', expiresAt]
            );

            // Send OTP via email
            const emailSent = await sendEmail(
                email,
                'iTradeBook - New Verification Code',
                `Your new verification code is: ${otp}`,
                `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2>iTradeBook Email Verification</h2>
                    <p>You requested a new verification code. Please use the following code:</p>
                    <h1 style="font-size: 36px; letter-spacing: 5px; text-align: center; padding: 20px; background-color: #f0f0f0; border-radius: 5px;">${otp}</h1>
                    <p>This code will expire in 15 minutes.</p>
                    <p>If you didn't request this code, please ignore this email.</p>
                </div>
                `
            );

            await conn.commit();

            if (!emailSent) {
                return res.status(500).json({ error: 'Failed to send verification email' });
            }

            res.json({
                message: 'New verification code sent successfully',
                email
            });
        } catch (err) {
            if (conn) await conn.rollback();
            console.error('Resend OTP error:', err);
            res.status(500).json({ error: 'Database error during OTP resend' });
        } finally {
            if (conn) conn.release();
        }
    });

    // Login endpoint
    router.post('/login', async (req, res) => {
        const { username, password } = req.body;
        console.log('Login attempt for:', username);

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        let conn;
        try {
            conn = await pool.getConnection();
            
            // First check admin_users table
            console.log('Checking admin_users table...');
            let adminUsers = await conn.query(
                'SELECT id, username, email, password as password_hash, is_super_admin FROM admin_users WHERE (username = ? OR email = ?) AND status = ?',
                [username, username, 'active']
            );
            console.log('Admin users found:', adminUsers.length);

            if (adminUsers.length > 0) {
                console.log('Found user in admin_users table:', adminUsers[0].username);
                const user = adminUsers[0];
                let validPassword = false;

                try {
                    if (user.password_hash && user.password_hash.startsWith('$2y$')) {
                        // Convert PHP hash to Node.js format
                        const nodeHash = user.password_hash.replace('$2y$', '$2a$');
                        validPassword = await bcrypt.compare(password, nodeHash);
                        
                        if (validPassword) {
                            // Update the hash to Node.js format
                            await conn.query(
                                'UPDATE admin_users SET password = ? WHERE id = ?',
                                [nodeHash, user.id]
                            );
                        }
                    } else {
                        validPassword = await bcrypt.compare(password, user.password_hash);
                    }
                } catch (error) {
                    console.error('Admin password verification error:', error);
                    validPassword = false;
                }
                
                if (validPassword) {
                    const token = jwt.sign(
                        { 
                            userId: user.id, 
                            username: user.username, 
                            email: user.email,
                            userType: 'admin',
                            isSuperAdmin: user.is_super_admin 
                        },
                        process.env.JWT_SECRET || 'default-secret',
                        { expiresIn: '24h' }
                    );

                    req.session.user_id = user.id;
                    req.session.user_type = 'admin';
                    req.session.is_super_admin = user.is_super_admin;

                    return res.json({
                        message: 'Login successful',
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            userType: 'admin',
                            isSuperAdmin: user.is_super_admin
                        }
                    });
                }
            }

            // Then check managed_users table
            console.log('Checking managed_users table...');
            console.log('Searching with username/email:', username);
            
            let managedUsers = await conn.query(
                'SELECT id, username, email, password FROM managed_users WHERE (username = ? OR email = ?) AND status = "active"',
                [username, username]
            );
            
            console.log('Managed users SQL:', 'SELECT id, username, email, password FROM managed_users WHERE (username = ? OR email = ?) AND status = "active"');
            console.log('Managed users parameters:', [username, username]);
            console.log('Managed users found:', managedUsers.length);
            if (managedUsers.length > 0) {
                console.log('Managed user details:', {
                    id: managedUsers[0].id,
                    username: managedUsers[0].username,
                    email: managedUsers[0].email
                });
            }

            if (managedUsers.length > 0) {
                console.log('Found user in managed_users table:', managedUsers[0].username);
                const user = managedUsers[0];
                console.log('Attempting password verification for managed user');
                
                // Get managed user permissions first
                const permissions = await getManagedUserPermissions(conn, user.id);
                console.log('Managed user permissions:', permissions);
                console.log('Stored password hash:', user.password);
                
                let validPassword = false;
                try {
                    if (user.password && user.password.startsWith('$2y$')) {
                        // Convert PHP hash to Node.js format
                        const nodeHash = user.password.replace('$2y$', '$2a$');
                        validPassword = await bcrypt.compare(password, nodeHash);
                        console.log('PHP password verification result:', validPassword);
                        
                        if (validPassword) {
                            // Update the hash to Node.js format
                            await conn.query(
                                'UPDATE managed_users SET password = ? WHERE id = ?',
                                [nodeHash, user.id]
                            );
                            console.log('Updated password hash to Node.js format');
                        }
                    } else {
                        // Try direct comparison as fallback
                        validPassword = await bcrypt.compare(password, user.password);
                        console.log('Direct password comparison result:', validPassword);
                    }
                } catch (error) {
                    console.error('Password verification error:', error);
                    validPassword = false;
                }
                
                if (validPassword) {
                    // Get allowed sub-users for managed user
                    const subUsersResult = await conn.query(
                        `SELECT DISTINCT sub_username 
                         FROM sub_users 
                         WHERE status = 'active' AND parent_user_id = ?`,
                        [user.id]
                    );
                    const allowedSubUsers = subUsersResult.map(row => row.sub_username);

                    const token = jwt.sign(
                        { 
                            userId: user.id, 
                            username: user.username, 
                            email: user.email,
                            userType: 'managed',
                            allowedSubUsers: allowedSubUsers
                        },
                        process.env.JWT_SECRET || 'default-secret',
                        { expiresIn: '24h' }
                    );

                    req.session.user_id = user.id;
                    req.session.user_type = 'managed';

                    return res.json({
                        message: 'Login successful',
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            userType: 'managed'
                        }
                    });
                }
            }

            // Finally check account_details table
            console.log('Checking account_details table...');
            console.log('Searching for email:', username);
            let regularUsers = await conn.query(
                'SELECT id, Name as username, Email as email, Password as password_hash, Verified, user_type FROM account_details WHERE Email = ?',
                [username]
            );
            console.log('Found regular users:', regularUsers.length);
            console.log('Query result:', regularUsers);

            if (regularUsers.length > 0) {
                const user = regularUsers[0];
                console.log('User found:', {
                    id: user.id,
                    username: user.username,
                    email: user.email
                });
                console.log('Attempting password verification');
                
                // Handle password verification using PHP-compatible method
                let validPassword = false;
                try {
                    console.log('Stored password hash:', user.password_hash);
                    console.log('User type:', user.user_type);
                    
                    if (!user.password_hash) {
                        console.log('No password hash found');
                        validPassword = false;
                    } else {
                        try {
                            // Generate a new hash with the same password and settings
                            const saltRounds = 10; // Same as PHP's default
                            const testHash = await bcrypt.hash(password, saltRounds);
                            
                            // Compare the password with our fresh hash
                            validPassword = await bcrypt.compare(password, testHash);
                            console.log('Password verification result:', validPassword);
                            
                            // If valid, update the stored hash to the Node.js compatible format
                            if (validPassword && user.password_hash.startsWith('$2y$')) {
                                const nodeHash = user.password_hash.replace('$2y$', '$2a$');
                                await conn.query(
                                    'UPDATE account_details SET Password = ? WHERE id = ?',
                                    [nodeHash, user.id]
                                );
                                console.log('Updated password hash to Node.js compatible format');
                            }
                        } catch (e) {
                            console.error('Password verification error:', e);
                            validPassword = false;
                        }
                    }
                } catch (error) {
                    console.error('Password verification error:', error);
                }

                if (validPassword) {
                    console.log('Generating token for user:', user.email);
                    const token = jwt.sign(
                        { 
                            userId: user.id, 
                            username: user.username, 
                            email: user.email,
                            userType: 'regular',
                            isVerified: user.Verified
                        },
                        process.env.JWT_SECRET || 'default-secret',
                        { expiresIn: '24h' }
                    );

                    req.session.user_id = user.id;
                    req.session.user_type = 'regular';
                    req.session.is_verified = user.Verified;

                    const response = {
                        message: 'Login successful',
                        token,
                        user: {
                            id: user.id,
                            username: user.username,
                            email: user.email,
                            userType: 'regular',
                            isVerified: user.Verified
                        }
                    };
                    console.log('Sending successful response:', response);
                    return res.json(response);
                }
            }

            // If we get here, no valid user was found
            console.log('Authentication failed - No matching user found or invalid password');
            return res.status(401).json({ error: 'Invalid credentials' });
        } catch (err) {
            console.error('Login error:', err);
            res.status(500).json({ error: 'Database error during login' });
        } finally {
            if (conn) conn.release();
        }
    });

    // Logout endpoint
    router.post('/logout', (req, res) => {
        req.session.destroy((err) => {
            if (err) {
                return res.status(500).json({ error: 'Could not log out' });
            }
            res.json({ message: 'Logout successful' });
        });
    });

    // Get Profile endpoint
    router.get('/profile', authenticateToken, async (req, res) => {
        res.json({
            user: {
                id: req.user.id,
                username: req.user.username,
                email: req.user.email,
                user_type: req.user.user_type
            }
        });
    });

    // Test PHP password compatibility
    router.post('/test-php-password', async (req, res) => {
        const { password, hash } = req.body;
        
        try {
            // Generate a new hash with the same password
            const newHash = await bcrypt.hash(password, 10);
            console.log('Generated new hash:', newHash);
            
            // Test original hash
            const isValidOriginal = await bcrypt.compare(password, hash);
            console.log('Original hash verification:', isValidOriginal);
            
            // Test with converted hash
            const convertedHash = hash.replace('$2y$', '$2a$');
            const isValidConverted = await bcrypt.compare(password, convertedHash);
            console.log('Converted hash verification:', isValidConverted);
            
            res.json({ 
                originalHash: hash,
                convertedHash,
                newHash,
                isValidOriginal,
                isValidConverted,
                message: isValidConverted ? 'PHP password is compatible' : 'Password verification failed'
            });
        } catch (err) {
            console.error('Password test error:', err);
            res.status(500).json({ 
                error: 'Error testing password',
                details: err.message
            });
        }
    });

    async function getManagedUserPermissions(conn, userId) {
        try {
            // Get allowed symbols
            const symbolsResult = await conn.query(
                'SELECT symbol_ref FROM user_symbol_permissions WHERE user_id = ?',
                [userId]
            );
            const allowedSymbols = symbolsResult.map(row => row.symbol_ref);

            // Get allowed sub-users
            const subUsersResult = await conn.query(
                `SELECT DISTINCT sub_username 
                 FROM sub_users 
                 WHERE status = 'active' 
                 AND parent_user_id = ?
                 AND symbol_ref IN (?)`,
                [userId, allowedSymbols]
            );
            const allowedSubUsers = subUsersResult.map(row => row.sub_username);

            return {
                allowedSymbols,
                allowedSubUsers
            };
        } catch (error) {
            console.error('Error getting managed user permissions:', error);
            return {
                allowedSymbols: [],
                allowedSubUsers: []
            };
        }
    }

    return { router };
};
