const { MongoClient } = require('mongodb');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function checkUser(phoneOrEmail, password) {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('kisan-mitra');
    const usersCollection = db.collection('users');

    // Try to find user by phone or email
    const user = await usersCollection.findOne({
      $or: [
        { mobile: phoneOrEmail },
        { email: phoneOrEmail }
      ]
    });

    if (!user) {
      console.log('❌ User not found with identifier:', phoneOrEmail);
      return;
    }

    console.log('\n✅ User found:');
    console.log('='.repeat(60));
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email || 'N/A'}`);
    console.log(`Mobile: ${user.mobile || 'N/A'}`);
    console.log(`Role: ${user.role}`);
    console.log(`Active: ${user.isActive ? '✅ Yes' : '❌ No'}`);
    console.log(`Verified: ${user.isVerified ? '✅ Yes' : '❌ No'}`);
    console.log(`Created: ${user.createdAt}`);
    console.log(`Last Login: ${user.lastLogin || 'Never'}`);
    
    // Check if password is set
    if (!user.password) {
      console.log('\n❌ No password set for this user');
      return;
    }

    // If password is provided as second argument, try to verify it
    if (password) {
      console.log('\n🔍 Verifying password...');
      try {
        const isMatch = await bcrypt.compare(password, user.password);
        console.log(`🔑 Password verification: ${isMatch ? '✅ Match' : '❌ Mismatch'}`);
        
        if (!isMatch) {
          console.log('\n⚠️  The password you entered is incorrect.');
          console.log('   - Make sure Caps Lock is off');
          console.log('   - Check for any typos');
        }
      } catch (error) {
        console.error('Error verifying password:', error.message);
      }
    } else {
      console.log('\nℹ️  No password provided for verification');
      console.log('   Usage: node check-user-credentials.js <phone_or_email> <password>');
    }
    
    // Check if user is active
    if (!user.isActive) {
      console.log('\n⚠️  Account is not active. Please verify your email or contact support.');
    }

  } catch (error) {
    console.error('Error checking user:', error);
  } finally {
    await client.close();
  }
}

// Get command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node check-user-credentials.js <phone_or_email> [password]');
  console.log('Example: node check-user-credentials.js 8885299384 mypassword');
  process.exit(1);
}

const identifier = args[0];
const password = args[1];

console.log(`🔍 Checking user: ${identifier}${password ? ' (with password verification)' : ''}`);
checkUser(identifier, password);
