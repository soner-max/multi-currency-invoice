// index.js
const express = require('express');
const { sql, poolPromise } = require('./db');
require('dotenv').config();

const app = express();

// Body Parser Middleware (Gelen JSON isteklerini okumak için)
app.use(express.json());

// 1. Fatura Ekleme Endpoint'i (POST)
app.post('/api/invoices', async (req, res) => {
  try {
    const { title, amountOriginal, currencyOriginal, exchangeRate } = req.body;

    // Veri Doğrulama (Validation)
    if (!title || !amountOriginal || !currencyOriginal || !exchangeRate) {
      return res.status(400).json({ 
        error: 'Lütfen title, amountOriginal, currencyOriginal ve exchangeRate alanlarını eksiksiz gönderin.' 
      });
    }

    // Backend Tarafında Hesaplama Mantığı (Çarpım İşlemi)
    const amountBase = Number(amountOriginal) * Number(exchangeRate);

    // Veri Tabanı İsteği
    const pool = await poolPromise;
    const result = await pool.request()
      .input('title', sql.NVarChar(100), title)
      .input('amountOriginal', sql.Decimal(18, 2), amountOriginal)
      .input('currencyOriginal', sql.NVarChar(3), currencyOriginal.toUpperCase())
      .input('exchangeRate', sql.Decimal(18, 4), exchangeRate)
      .input('amountBase', sql.Decimal(18, 2), amountBase)
      .query(`
        INSERT INTO Invoices (Title, AmountOriginal, CurrencyOriginal, ExchangeRate, AmountBase)
        OUTPUT INSERTED.Id, INSERTED.CreatedAt
        VALUES (@title, @amountOriginal, @currencyOriginal, @exchangeRate, @amountBase)
      `);

    // Başarılı Yanıt
    res.status(201).json({
      message: 'Fatura başarıyla eklendi.',
      invoice: {
        id: result.recordset[0].Id,
        title,
        amountOriginal: Number(amountOriginal),
        currencyOriginal: currencyOriginal.toUpperCase(),
        exchangeRate: Number(exchangeRate),
        amountBase,
        createdAt: result.recordset[0].CreatedAt
      }
    });

  } catch (error) {
    console.error('Fatura ekleme hatası:', error);
    res.status(500).json({ error: 'Fatura eklenirken sunucu hatası oluştu.' });
  }
});

// 2. Tüm Faturaları Listeleme Endpoint'i (GET)
app.get('/api/invoices', async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        Id,
        Title,
        AmountOriginal,
        CurrencyOriginal,
        ExchangeRate,
        AmountBase,
        CreatedAt
      FROM Invoices
      ORDER BY CreatedAt DESC
    `);

    res.status(200).json(result.recordset);

  } catch (error) {
    console.error('Fatura listeleme hatası:', error);
    res.status(500).json({ error: 'Faturalar çekilirken sunucu hatası oluştu.' });
  }
});

// Sunucuyu Çalıştır
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Express sunucusu ${PORT} portunda dinlemede.`);
});