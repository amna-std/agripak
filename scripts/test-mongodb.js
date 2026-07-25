const { MongoClient } = require('mongodb');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function testConnection() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 5000,
  });

  try {
    console.log('🔍 Testing MongoDB connection...');
    await client.connect();
    
    console.log('✅ Successfully connected to MongoDB');
    
    // List all databases
    const adminDb = client.db('admin');
    const result = await adminDb.admin().listDatabases();
    
    console.log('\n📊 Available databases:');
    result.databases.forEach(db => {
      console.log(`- ${db.name} (size: ${db.sizeOnDisk ? (db.sizeOnDisk / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'})`);
    });
    
    // Check if kisan-mitra database exists
    const targetDb = result.databases.find(db => db.name === 'kisan-mitra');
    if (targetDb) {
      console.log('\n✅ kisan-mitra database found');
      
      // List collections in kisan-mitra
      const db = client.db('kisan-mitra');
      const collections = await db.listCollections().toArray();
      
      console.log('\n📋 Collections in kisan-mitra:');
      collections.forEach(collection => {
        console.log(`- ${collection.name}`);
      });
    } else {
      console.log('\n❌ kisan-mitra database not found');
    }
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('   - Make sure MongoDB is running');
    console.error('   - Check your MONGODB_URI in .env file');
    console.error('   - Try running: mongod --version');
  } finally {
    await client.close();
  }
}

testConnection();
