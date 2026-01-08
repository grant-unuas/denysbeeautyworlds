require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs-extra');
const crypto = require('crypto');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult, escape } = require('express-validator');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting
const loginLimiter = rateLimit({
    windowMs: parseInt(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.ENABLE_HTTPS === 'true',
        httpOnly: true,
        maxAge: parseInt(process.env.SESSION_MAX_AGE) || 2 * 60 * 60 * 1000
    }
}));

// Ensure uploads directory exists
fs.ensureDirSync(path.join(__dirname, 'uploads'));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image and video files are allowed!'), false);
        }
    },
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for videos
});

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.adminId) {
        return next();
    } else {
        return res.status(401).json({ error: 'Authentication required' });
    }
}

// Admin login endpoint with validation
app.post('/api/admin/login', 
    loginLimiter,
    [
        body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: 'Invalid input', details: errors.array() });
            }

            const { email, password } = req.body;
            
            const admins = db.read('admins');
            const admin = admins.find(a => a.email === email);
            
            if (!admin || !verifyPassword(password, admin.password)) {
                return res.status(401).json({ error: 'Invalid credentials' });
            }
            
            req.session.adminId = admin.id;
            req.session.adminEmail = admin.email;
            
            res.json({ 
                success: true, 
                admin: { 
                    id: admin.id, 
                    email: sanitizeInput(admin.email), 
                    full_name: sanitizeInput(admin.full_name) 
                } 
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Login failed' });
        }
    }
);

// Admin logout endpoint
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ success: true });
    });
});

// Create admin account (for initial setup)
app.post('/api/admin/create', async (req, res) => {
    try {
        const { email, password, full_name } = req.body;
        
        if (!email || !password || !full_name) {
            return res.status(400).json({ error: 'All fields required' });
        }
        
        const admins = db.read('admins');
        if (admins.find(a => a.email === email)) {
            return res.status(400).json({ error: 'Admin already exists' });
        }
        
        const hashedPassword = hashPassword(password);
        const admin = db.insert('admins', {
            email,
            password: hashedPassword,
            full_name,
            provider: 'email'
        });
        
        res.json({ success: true, admin: { id: admin.id, email: admin.email, full_name: admin.full_name } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create admin' });
    }
});

// Protected API Routes

// Upload image endpoint
app.post('/api/upload', requireAuth, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        res.json({ 
            success: true, 
            filename: req.file.filename,
            url: `/uploads/${req.file.filename}`
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed: ' + error.message });
    }
});

// Get all products (public)
app.get('/api/products', (req, res) => {
    try {
        const products = db.read('products');
        res.json(products);
    } catch (error) {
        console.error('Error getting products:', error);
        res.status(500).json({ error: 'Failed to get products: ' + error.message });
    }
});

// Add new product (protected with validation)
app.post('/api/products', 
    requireAuth,
    [
        body('name').isLength({ min: 1, max: 100 }).trim().withMessage('Product name required (1-100 chars)'),
        body('description').optional().isLength({ max: 500 }).trim().withMessage('Description too long (max 500 chars)'),
        body('price').isFloat({ min: 0 }).withMessage('Valid price required'),
        body('category').isIn(['revamping', 'styling', 'wig-installation', 'retouching', 'ventilation']).withMessage('Invalid category')
    ],
    (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ error: 'Invalid input', details: errors.array() });
            }

            const { name, description, price, image_url, category } = req.body;
            
            const product = db.insert('products', { 
                name: sanitizeInput(name), 
                description: sanitizeInput(description || ''), 
                price: parseFloat(price), 
                image_url: sanitizeInput(image_url || ''), 
                category: sanitizeInput(category), 
                in_stock: true 
            });
            
            res.json({ success: true, product });
        } catch (error) {
            console.error('Error adding product:', error);
            res.status(500).json({ error: 'Failed to add product' });
        }
    }
);

// Update product
app.put('/api/products/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, image_url, category } = req.body;
        
        console.log('Updating product:', id, req.body);
        
        if (!name || !price) {
            return res.status(400).json({ error: 'Name and price are required' });
        }
        
        const product = db.update('products', parseInt(id), { 
            name, 
            description: description || '', 
            price: parseFloat(price), 
            image_url: image_url || '', 
            category: category || 'wig' 
        });
        
        if (!product) {
            console.log('Product not found:', id);
            return res.status(404).json({ error: 'Product not found' });
        }
        
        console.log('Product updated successfully:', product);
        res.json({ success: true, product });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({ error: 'Failed to update product: ' + error.message });
    }
});

// Delete product
app.delete('/api/products/:id', (req, res) => {
    try {
        const { id } = req.params;
        const success = db.delete('products', parseInt(id));
        
        if (!success) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({ error: 'Failed to delete product: ' + error.message });
    }
});

// Get all bookings
app.get('/api/bookings', (req, res) => {
    const bookings = db.read('bookings');
    res.json(bookings);
});

// Add new booking
app.post('/api/bookings', (req, res) => {
    const { customer_name, customer_phone, customer_email, service_name, booking_date, booking_time, notes } = req.body;
    const booking = db.insert('bookings', { 
        customer_name, customer_phone, customer_email, service_name, 
        booking_date, booking_time, notes, status: 'pending' 
    });
    res.json({ success: true, booking });
});

// Update booking status
app.put('/api/bookings/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const booking = db.update('bookings', parseInt(id), { status });
        
        if (!booking) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        res.json({ success: true, booking });
    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ error: 'Failed to update booking: ' + error.message });
    }
});

// Delete all bookings
app.delete('/api/bookings/all', (req, res) => {
    try {
        db.write('bookings', []);
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting all bookings:', error);
        res.status(500).json({ error: 'Failed to delete all bookings: ' + error.message });
    }
});

// Get all services
app.get('/api/services', (req, res) => {
    const services = db.read('services');
    res.json(services);
});

// Add new service
app.post('/api/services', (req, res) => {
    const { name, description, price, duration } = req.body;
    const service = db.insert('services', { name, description, price, duration });
    res.json({ success: true, service });
});

// Delete service
app.delete('/api/services/:id', (req, res) => {
    try {
        const { id } = req.params;
        const success = db.delete('services', parseInt(id));
        
        if (!success) {
            return res.status(404).json({ error: 'Service not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting service:', error);
        res.status(500).json({ error: 'Failed to delete service: ' + error.message });
    }
});

// Get all gallery images
app.get('/api/gallery', (req, res) => {
    const gallery = db.read('gallery');
    res.json(gallery);
});

// Add gallery image
app.post('/api/gallery', upload.single('image'), (req, res) => {
    try {
        const { title, category } = req.body;
        let image_url = '';
        
        if (req.file) {
            image_url = `/uploads/${req.file.filename}`;
        }
        
        const image = db.insert('gallery', { 
            title: title || 'Untitled Image', 
            image_url, 
            category: category || 'styling' 
        });
        
        res.json({ success: true, image });
    } catch (error) {
        console.error('Error adding gallery image:', error);
        res.status(500).json({ error: 'Failed to add image: ' + error.message });
    }
});

// Delete gallery image
app.delete('/api/gallery/:id', (req, res) => {
    try {
        const { id } = req.params;
        const success = db.delete('gallery', parseInt(id));
        
        if (!success) {
            return res.status(404).json({ error: 'Image not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting gallery image:', error);
        res.status(500).json({ error: 'Failed to delete image: ' + error.message });
    }
});

// Get all videos
app.get('/api/videos', (req, res) => {
    const videos = db.read('videos');
    res.json(videos);
});

// Add video
app.post('/api/videos', upload.single('video'), (req, res) => {
    try {
        const { title, description } = req.body;
        let video_url = '';
        let thumbnail_url = '';
        
        if (req.file) {
            video_url = `/uploads/${req.file.filename}`;
        }
        
        const video = db.insert('videos', { 
            title: title || 'Untitled Video', 
            video_url, 
            thumbnail_url, 
            description: description || '' 
        });
        
        res.json({ success: true, video });
    } catch (error) {
        console.error('Error adding video:', error);
        res.status(500).json({ error: 'Failed to add video: ' + error.message });
    }
});

// Update video
app.put('/api/videos/:id', upload.single('video'), (req, res) => {
    try {
        const { id } = req.params;
        const { title, description } = req.body;
        
        const existingVideo = db.findById('videos', parseInt(id));
        if (!existingVideo) {
            return res.status(404).json({ error: 'Video not found' });
        }
        
        let video_url = existingVideo.video_url;
        if (req.file) {
            video_url = `/uploads/${req.file.filename}`;
        }
        
        const video = db.update('videos', parseInt(id), {
            title: title || existingVideo.title,
            description: description || existingVideo.description,
            video_url
        });
        
        res.json({ success: true, video });
    } catch (error) {
        console.error('Error updating video:', error);
        res.status(500).json({ error: 'Failed to update video: ' + error.message });
    }
});

// Delete video
app.delete('/api/videos/:id', (req, res) => {
    try {
        const { id } = req.params;
        console.log('Deleting video with ID:', id);
        
        const success = db.delete('videos', parseInt(id));
        console.log('Delete result:', success);
        
        if (!success) {
            console.log('Video not found for ID:', id);
            return res.status(404).json({ error: 'Video not found' });
        }
        
        console.log('Video deleted successfully');
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting video:', error);
        res.status(500).json({ error: 'Failed to delete video: ' + error.message });
    }
});

// Profile endpoints
// Get all profiles
app.get('/api/profiles', (req, res) => {
    try {
        const profiles = db.read('profiles');
        res.json(profiles);
    } catch (error) {
        console.error('Error getting profiles:', error);
        res.status(500).json({ error: 'Failed to get profiles: ' + error.message });
    }
});

// Get profile
app.get('/api/profile/:id', (req, res) => {
    try {
        const { id } = req.params;
        const profile = db.findById('profiles', parseInt(id));
        
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        res.json(profile);
    } catch (error) {
        console.error('Error getting profile:', error);
        res.status(500).json({ error: 'Failed to get profile: ' + error.message });
    }
});

// Create/Update profile
app.post('/api/profile', upload.single('photo'), (req, res) => {
    try {
        const { name, email, phone, bio, userId, deletePhoto } = req.body;
        let photo_url = '';
        
        if (req.file) {
            photo_url = `/uploads/${req.file.filename}`;
        }
        
        // Check if profile exists
        const profiles = db.read('profiles');
        const existingProfile = profiles.find(p => p.userId === userId);
        
        if (existingProfile) {
            // Update existing profile
            const updatedProfile = db.update('profiles', existingProfile.id, {
                name: name || existingProfile.name,
                email: email || existingProfile.email,
                phone: phone || existingProfile.phone,
                bio: bio || existingProfile.bio,
                photo_url: deletePhoto === 'true' ? '' : (photo_url || existingProfile.photo_url)
            });
            res.json({ success: true, profile: updatedProfile });
        } else {
            // Create new profile
            const profile = db.insert('profiles', {
                userId,
                name: name || 'Admin',
                email: email || 'admin@example.com',
                phone: phone || '',
                bio: bio || '',
                photo_url: deletePhoto === 'true' ? '' : photo_url
            });
            res.json({ success: true, profile });
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        res.status(500).json({ error: 'Failed to save profile: ' + error.message });
    }
});

// Delete profile photo
app.delete('/api/profile/:id/photo', (req, res) => {
    try {
        const { id } = req.params;
        const profile = db.findById('profiles', parseInt(id));
        
        if (!profile) {
            return res.status(404).json({ error: 'Profile not found' });
        }
        
        const updatedProfile = db.update('profiles', parseInt(id), {
            photo_url: ''
        });
        
        res.json({ success: true, profile: updatedProfile });
    } catch (error) {
        console.error('Error deleting profile photo:', error);
        res.status(500).json({ error: 'Failed to delete photo: ' + error.message });
    }
});


// Static file routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/admin/reset', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'reset.html'));
});

app.get('/admin/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'signup.html'));
});

app.get('/admin/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'login.html'));
});

app.get('/admin/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'dashboard.html'));
});

app.get('/products', (req, res) => {
    res.sendFile(path.join(__dirname, 'products.html'));
});

app.get('/videos', (req, res) => {
    res.sendFile(path.join(__dirname, 'videos.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin login: http://localhost:${PORT}/admin/login.html`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin/dashboard.html`);
    console.log('Database initialized successfully');
});
