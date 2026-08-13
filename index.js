// index.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('./db');
const { getExchangeRate } = require('./currencyService');
const authenticateToken = require('./authMiddleware');
require('dotenv').config();

const app = express();
app.use(express.json());

// ==========================================
// 1. AUTHENTICATION ENDPOINTS (KAYIT & GİRİŞ)
// ==========================================

// Kullanıcı Kaydı (Register)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, baseCurrency } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre zorunludur.' });
    }

    const pool = await poolPromise;

    // Email Kontrolü
    const userCheck = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query('SELECT Id FROM Users WHERE Email = @email');

    if (userCheck.recordset.length > 0) {
      return res.status(400).json({ error: 'Bu email adresi zaten kayıtlı.' });
    }

    // Şifre Hashleme
    const hashedPassword = await bcrypt.hash(password, 10);
    const userBaseCurrency = (baseCurrency || 'TRY').toUpperCase();

    const result = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .input('passwordHash', sql.NVarChar(255), hashedPassword)
      .input('baseCurrency', sql.NVarChar(3), userBaseCurrency)
      .query(`
        INSERT INTO Users (Email, PasswordHash, BaseCurrency)
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (@email, @passwordHash, @baseCurrency)
      `);

    res.status(201).json({
      message: 'Kullanıcı kaydı başarıyla oluşturuldu.',
      userId: result.recordset[0].Id
    });

  } catch (error) {
    console.error('Kayıt hatası:', error);
    res.status(500).json({ error: 'Kayıt sırasında bir hata oluştu.' });
  }
});

// Kullanıcı Girişi (Login)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email ve şifre zorunludur.' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('email', sql.NVarChar(255), email)
      .query('SELECT * FROM Users WHERE Email = @email');

    if (result.recordset.length === 0) {
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }

    const user = result.recordset[0];
    const isPasswordValid = await bcrypt.compare(password, user.PasswordHash);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Geçersiz email veya şifre.' });
    }

    // JWT Üretimi
    const token = jwt.sign(
      { userId: user.Id, email: user.Email, baseCurrency: user.BaseCurrency },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Giriş başarılı.',
      token,
      user: {
        id: user.Id,
        email: user.Email,
        baseCurrency: user.BaseCurrency
      }
    });

  } catch (error) {
    console.error('Giriş hatası:', error);
    res.status(500).json({ error: 'Giriş sırasında bir hata oluştu.' });
  }
});

// ==========================================
// 2. KORUMALI MÜŞTERİ ENDPOINTS (AUTH REQUIRED)
// ==========================================

app.post('/api/customers', authenticateToken, async (req, res) => {
  try {
    const { name, taxNumber, email } = req.body;
    const userId = req.user.userId;

    if (!name) {
      return res.status(400).json({ error: 'Müşteri adı zorunludur.' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('name', sql.NVarChar(100), name)
      .input('taxNumber', sql.NVarChar(50), taxNumber || null)
      .input('email', sql.NVarChar(100), email || null)
      .input('userId', sql.Int, userId)
      .query(`
        INSERT INTO Customers (Name, TaxNumber, Email, UserId)
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (@name, @taxNumber, @email, @userId)
      `);

    res.status(201).json({
      message: 'Müşteri oluşturuldu.',
      customer: { id: result.recordset[0].Id, name, taxNumber, email }
    });
  } catch (error) {
    console.error('Müşteri ekleme hatası:', error);
    res.status(500).json({ error: 'Müşteri eklenirken hata oluştu.' });
  }
});

app.get('/api/customers', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query('SELECT Id, Name, TaxNumber, Email, CreatedAt FROM Customers WHERE UserId = @userId ORDER BY CreatedAt DESC');

    res.json(result.recordset);
  } catch (error) {
    console.error('Müşteri listeleme hatası:', error);
    res.status(500).json({ error: 'Müşteriler çekilirken hata oluştu.' });
  }
});

// ==========================================
// 3. KORUMALI FATURA ENDPOINTS (AUTH REQUIRED)
// ==========================================

app.post('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const { title, amountOriginal, currencyOriginal, customerId } = req.body;
    const userId = req.user.userId;
    const userBaseCurrency = req.user.baseCurrency || 'TRY';

    if (!title || !amountOriginal || !currencyOriginal) {
      return res.status(400).json({ error: 'title, amountOriginal ve currencyOriginal alanları zorunludur.' });
    }

    const currencyUpper = currencyOriginal.toUpperCase();
    const exchangeRate = await getExchangeRate(currencyUpper, userBaseCurrency);
    const amountBase = Number(amountOriginal) * exchangeRate;

    const pool = await poolPromise;
    const result = await pool.request()
      .input('title', sql.NVarChar(100), title)
      .input('amountOriginal', sql.Decimal(18, 2), amountOriginal)
      .input('currencyOriginal', sql.NVarChar(3), currencyUpper)
      .input('exchangeRate', sql.Decimal(18, 4), exchangeRate)
      .input('amountBase', sql.Decimal(18, 2), amountBase)
      .input('customerId', sql.Int, customerId || null)
      .input('userId', sql.Int, userId)
      .query(`
        INSERT INTO Invoices (Title, AmountOriginal, CurrencyOriginal, ExchangeRate, AmountBase, CustomerId, UserId)
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (@title, @amountOriginal, @currencyOriginal, @exchangeRate, @amountBase, @customerId, @userId)
      `);

    res.status(201).json({
      message: 'Fatura oluşturuldu.',
      invoice: {
        id: result.recordset[0].Id,
        title,
        amountOriginal: Number(amountOriginal),
        currencyOriginal: currencyUpper,
        exchangeRate,
        amountBaseInUserCurrency: Number(amountBase.toFixed(2)),
        targetCurrency: userBaseCurrency
      }
    });

  } catch (error) {
    console.error('Fatura ekleme hatası:', error.message);
    res.status(500).json({ error: error.message || 'Fatura işlenirken hata oluştu.' });
  }
});

app.get('/api/invoices', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const pool = await poolPromise;
    const result = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          i.Id, i.Title, i.AmountOriginal, i.CurrencyOriginal, i.ExchangeRate, i.AmountBase, i.CreatedAt,
          c.Name AS CustomerName
        FROM Invoices i
        LEFT JOIN Customers c ON i.CustomerId = c.Id
        WHERE i.UserId = @userId
        ORDER BY i.CreatedAt DESC
      `);

    res.json(result.recordset);
  } catch (error) {
    console.error('Fatura listeleme hatası:', error);
    res.status(500).json({ error: 'Faturalar çekilirken hata oluştu.' });
  }
});

// ==========================================
// 4. FINANSAL RAPORLAMA / DASHBOARD ENDPOINT
// ==========================================

app.get('/api/reports/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const userBaseCurrency = req.user.baseCurrency || 'TRY';

    const pool = await poolPromise;

    // Kullanıcının Taban Para Birimi Cinsinden Toplam Cirosu ve Fatura Sayısı
    const totalMetrics = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          COUNT(Id) AS TotalInvoiceCount,
          ISNULL(SUM(AmountBase), 0) AS TotalRevenueInBaseCurrency
        FROM Invoices
        WHERE UserId = @userId
      `);

    // Para Birimlerine Göre Dağılım Metrikleri (SQL GROUP BY)
    const currencyBreakdown = await pool.request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          CurrencyOriginal,
          COUNT(Id) AS InvoiceCount,
          SUM(AmountOriginal) AS TotalOriginalAmount,
          SUM(AmountBase) AS TotalBaseAmount
        FROM Invoices
        WHERE UserId = @userId
        GROUP BY CurrencyOriginal
      `);

    res.json({
      userBaseCurrency,
      summary: {
        totalInvoiceCount: totalMetrics.recordset[0].TotalInvoiceCount,
        totalRevenue: totalMetrics.recordset[0].TotalRevenueInBaseCurrency
      },
      currencyBreakdown: currencyBreakdown.recordset
    });

  } catch (error) {
    console.error('Raporlama hatası:', error);
    res.status(500).json({ error: 'Rapor verileri hesaplanırken hata oluştu.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express sunucusu ${PORT} portunda dinlemede.`);
});