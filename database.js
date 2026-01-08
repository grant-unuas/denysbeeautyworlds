const fs = require('fs-extra');
const path = require('path');

const dbPath = path.join(__dirname, 'data');
const dbFiles = {
    admins: path.join(dbPath, 'admins.json'),
    products: path.join(dbPath, 'products.json'),
    services: path.join(dbPath, 'services.json'),
    bookings: path.join(dbPath, 'bookings.json'),
    gallery: path.join(dbPath, 'gallery.json'),
    videos: path.join(dbPath, 'videos.json'),
    profiles: path.join(dbPath, 'profiles.json')
};

// Initialize database files
fs.ensureDirSync(dbPath);

Object.values(dbFiles).forEach(file => {
    if (!fs.existsSync(file)) {
        fs.writeJsonSync(file, []);
    }
});

const db = {
    read: (table) => {
        try {
            return fs.readJsonSync(dbFiles[table]);
        } catch (error) {
            return [];
        }
    },
    
    write: (table, data) => {
        fs.writeJsonSync(dbFiles[table], data, { spaces: 2 });
    },
    
    insert: (table, record) => {
        const data = db.read(table);
        record.id = Date.now();
        record.created_at = new Date().toISOString();
        data.push(record);
        db.write(table, data);
        return record;
    },
    
    findById: (table, id) => {
        const data = db.read(table);
        return data.find(item => item.id == id);
    },
    
    update: (table, id, updates) => {
        const data = db.read(table);
        const index = data.findIndex(item => item.id == id);
        console.log('Update - table:', table, 'id:', id, 'index:', index, 'data length:', data.length);
        if (index === -1) return null;
        
        data[index] = { ...data[index], ...updates, updated_at: new Date().toISOString() };
        db.write(table, data);
        console.log('Updated item:', data[index]);
        return data[index];
    },
    
    delete: (table, id) => {
        const data = db.read(table);
        const index = data.findIndex(item => item.id == id);
        console.log('Delete - table:', table, 'id:', id, 'index:', index, 'data length:', data.length);
        if (index === -1) return false;
        
        data.splice(index, 1);
        db.write(table, data);
        console.log('Item deleted, new data length:', data.length);
        return true;
    }
};

module.exports = db;