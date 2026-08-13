// index.js
const express = require('express');
const { sql, poolPromise } = require('./db');
const { getExchangeRate } = require('./currencyService');
require('dotenv').config();

const app = express();
app.use(express.json());

// Varsayılan Hedef Para Birimi (Raporlama/Taban Para Birimi)
const BASE_SYSTEM_CURRENCY = 'TRY';

// ==========================================
// 1. MÜŞTERİ YÖNETİMİ ENDPOINTS (CUSTOMERS)
// ==========================================

// Müşteri Ekleme
app.post('/api/customers', async (req, res) => {
  try {
    const { name, taxNumber, email } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Müşteri adı (name) zorunludur.' });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input('name', sql.NVarChar(100), name)
      .input('taxNumber', sql.NVarChar(50), taxNumber || null)
      .input('email', sql.NVarChar(100), email || null)
      .query(`
        INSERT INTO Customers (Name, TaxNumber, Email)
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (@name, @taxNumber, @email)
      `);

    res.status(201).json({
      message: 'Müşteri başarıyla oluşturuldu.',
      customer: {
        id: result.recordset[0].Id,
        name,
        taxNumber,
        email,
        createdAt: result.recordset[0].CreatedAt
      }
    });
  } catch (error) {
    console.error('Müşteri ekleme hatası:', error);
    res.status(500).json({ error: 'Müşteri eklenirken sunucu hatası oluştu.' });
  }
});

// Tüm Müşterileri Listeleme
app.get('/api/customers', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT Id, Name, TaxNumber, Email, CreatedAt
      FROM Customers
      ORDER BY CreatedAt DESC
    `);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Müşteri listeleme hatası:', error);
    res.status(500).json({ error: 'Müşteriler çekilirken sunucu hatası oluştu.' });
  }
});

// ==========================================
// 2. FATURA YÖNETİMİ ENDPOINTS (INVOICES)
// ==========================================

// Otomatik Kurlu Fatura Ekleme
app.post('/api/invoices', async (req, res) => {
  try {
    const { title, amountOriginal, currencyOriginal, customerId } = req.body;

    if (!title || !amountOriginal || !currencyOriginal) {
      return res.status(400).json({ 
        error: 'Lütfen title, amountOriginal ve currencyOriginal alanlarını eksiksiz gönderin.' 
      });
    }

    const currencyUpper = currencyOriginal.toUpperCase();

    // 1. Dış API'den Anlık Kur Çekilmesi
    const exchangeRate = await getExchangeRate(currencyUpper, BASE_SYSTEM_CURRENCY);

    // 2. Taban Tutar Hesaplaması (AmountBase)
    const amountBase = Number(amountOriginal) * exchangeRate;

    const pool = await poolPromise;
    const result = await pool.request()
      .input('title', sql.NVarChar(100), title)
      .input('amountOriginal', sql.Decimal(18, 2), amountOriginal)
      .input('currencyOriginal', sql.NVarChar(3), currencyUpper)
      .input('exchangeRate', sql.Decimal(18, 4), exchangeRate)
      .input('amountBase', sql.Decimal(18, 2), amountBase)
      .input('customerId', sql.Int, customerId || null)
      .query(`
        INSERT INTO Invoices (Title, AmountOriginal, CurrencyOriginal, ExchangeRate, AmountBase, CustomerId)
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (@title, @amountOriginal, @currencyOriginal, @exchangeRate, @amountBase, @customerId)
      `);

    res.status(201).json({
      message: 'Fatura canlı kur bilgisiyle başarıyla oluşturuldu.',
      invoice: {
        id: result.recordset[0].Id,
        title,
        amountOriginal: Number(amountOriginal),
        currencyOriginal: currencyUpper,
        fetchedExchangeRate: exchangeRate,
        amountBaseInTRY: Number(amountBase.toFixed(2)),
        customerId: customerId || null,
        createdAt: result.recordset[0].CreatedAt
      }
    });

  } catch (error) {
    console.error('Fatura oluşturma hatası:', error.message);
    res.status(500).json({ error: error.message || 'Fatura işlenirken bir hata oluştu.' });
  }
});

// Faturaları Müşteri Bilgisiyle Birlikte Listeleme (JOIN)
app.get('/api/invoices', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        i.Id,
        i.Title,
        i.AmountOriginal,
        i.CurrencyOriginal,
        i.ExchangeRate,
        i.AmountBase,
        i.CreatedAt,
        c.Id AS CustomerId,
        c.Name AS CustomerName
      FROM Invoices i
      LEFT JOIN Customers c ON i.CustomerId = c.Id
      ORDER BY i.CreatedAt DESC
    `);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error('Fatura listeleme hatası:', error);
    res.status(500).json({ error: 'Faturalar çekilirken sunucu hatası oluştu.' });
  }
});

// Sunucuyu Başlat
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express sunucusu ${PORT} portunda dinlemede.`);
});