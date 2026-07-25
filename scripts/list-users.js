const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Connect to MongoDB
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/kisan-mitra';
    console.log(`🔗 Connecting to MongoDB: ${mongoUri}`);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // 5 seconds timeout
      socketTimeoutMS: 45000, // 45 seconds socket timeout
    });
    
    console.log('✅ MongoDB Connected Successfully');
    console.log(`   - Database: ${mongoose.connection.db.databaseName}`);
    console.log(`   - Host: ${mongoose.connection.host}`);
    
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error.message);
    console.error('   - Make sure MongoDB is running and accessible');
    console.error('   - Check your MONGODB_URI in .env file');
    process.exit(1);
  }
};

// List all users
const listUsers = async () => {
  try {
    // Get the User model
    const User = require('../server/models/User');
    
    // Find all users
    const users = await User.find({}).select('name email mobile role isActive createdAt lastLogin');
    
    if (users.length === 0) {
      console.log('No users found in the database.');
      return;
    }
    
    console.log(`\n📋 Found ${users.length} users in the database:`);
    console.log('='.repeat(80));
    
    users.forEach((user, index) => {
      console.log(`\n👤 User #${index + 1}:`);
      console.log(`   Name: ${user.name}`);
      console.log(`   Email: ${user.email || 'N/A'}`);
      console.log(`   Mobile: ${user.mobile || 'N/A'}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Status: ${user.isActive ? '✅ Active' : '❌ Inactive'}`);
      console.log(`   Created: ${user.createdAt}`);
      console.log(`   Last Login: ${user.lastLogin || 'Never'}`);
      console.log('─'.repeat(40));
    });
    
  } catch (error) {
    console.error('Error listing users:', error);
  } finally {
    mongoose.connection.close();
  }
};

// Run the script
(async () => {
  await connectDB();
  await listUsers();
})();
