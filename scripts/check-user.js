const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('../server/models/User');

// Load environment variables
dotenv.config();

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/krishi-mitra', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected...');
  } catch (err) {
    console.error('Database connection error:', err);
    process.exit(1);
  }
};

// Check user and password
const checkUser = async (identifier, password) => {
  try {
    // Try to find user by email or phone
    const user = await User.findOne({
      $or: [
        { email: identifier },
        { mobile: identifier.replace(/\D/g, '') } // Remove non-digits for phone number
      ]
    });

    if (!user) {
      console.log('❌ User not found');
      return;
    }

    console.log('✅ User found:');
    console.log(`- Name: ${user.name}`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Mobile: ${user.mobile}`);
    
    // Check if password is set
    if (!user.password) {
      console.log('❌ No password set for this user');
      return;
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    console.log(`🔑 Password ${isMatch ? '✅ matches' : '❌ does not match'}`);
    
    // Check if user is active
    console.log(`- Active: ${user.isActive ? '✅ Yes' : '❌ No'}`);
    
    // Check last login
    console.log(`- Last Login: ${user.lastLogin || 'Never'}`);
    
  } catch (err) {
    console.error('Error checking user:', err);
  } finally {
    mongoose.connection.close();
  }
};

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('Usage: node check-user.js <email_or_phone> <password>');
  process.exit(1);
}

const [identifier, password] = args;

// Run the check
(async () => {
  await connectDB();
  console.log(`\n🔍 Checking user: ${identifier}`);
  await checkUser(identifier, password);
})();
