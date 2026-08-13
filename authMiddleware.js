// authMiddleware.js
const jwt = require('jsonwebtoken');
require('dotenv').config();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer TOKEN" ayrıştırması

  if (!token) {
    return res.status(401).json({ error: 'Erişim engellendi. Yetkilendirme token\'ı bulunamadı.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Geçersiz veya süresi dolmuş token.' });
    }
    
    req.user = user; // { userId, email, baseCurrency }
    next();
  });
}

module.exports = authenticateToken;