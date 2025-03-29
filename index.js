require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;


app.use(bodyParser.json());
app.use(cors());


const SECRET_KEY = process.env.SECRET_KEY;
const ACCESS_TOKEN_EXPIRE_MINUTES = 30;


const fakeUsersDb = {
  "analytics_user": {
    "username": "analytics_user",
    "hashedPassword": bcrypt.hashSync("secret", 8),
    "disabled": false,
  }
};

const mockDatabase = {
  "sales": [
    {"id": 1, "product": "Laptop", "amount": 1200, "date": "2023-01-15", "region": "North"},
    {"id": 2, "product": "Phone", "amount": 800, "date": "2023-01-16", "region": "South"},
    {"id": 3, "product": "Tablet", "amount": 450, "date": "2023-01-17", "region": "East"},
  ],
  "customers": [
    {"id": 1, "name": "John Doe", "email": "john@example.com", "join_date": "2022-12-01"},
    {"id": 2, "name": "Jane Smith", "email": "jane@example.com", "join_date": "2023-01-05"},
  ]
};


function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  
  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) return res.status(403).json({ error: "Forbidden" });
    req.user = user;
    next();
  });
}


function translateNaturalToPseudoSql(query) {
  query = query.toLowerCase();
  

  if (/how many/i.test(query)) {
    if (/sales/i.test(query)) {
      if (/last month/i.test(query)) {
        return "SELECT COUNT(*) FROM sales WHERE date >= '2023-01-01' AND date <= '2023-01-31'";
      }
      return "SELECT COUNT(*) FROM sales";
    }
    if (/customers/i.test(query)) return "SELECT COUNT(*) FROM customers";
  }
  
  if (/list all/i.test(query)) {
    if (/sales/i.test(query)) return "SELECT * FROM sales";
    if (/customers/i.test(query)) return "SELECT * FROM customers";
  }
  
  if (/total sales/i.test(query)) {
    if (/by region/i.test(query)) {
      return "SELECT region, SUM(amount) as total_sales FROM sales GROUP BY region";
    }
    return "SELECT SUM(amount) as total_sales FROM sales";
  }
  
  if (/average/i.test(query) && /sale/i.test(query)) {
    return "SELECT AVG(amount) as average_sale FROM sales";
  }
  
  if (/customer/i.test(query) && /joined/i.test(query) && /january/i.test(query)) {
    return "SELECT * FROM customers WHERE join_date >= '2023-01-01' AND join_date <= '2023-01-31'";
  }
  
  
  return `SELECT * FROM ${extractTableName(query)} LIMIT 10`;
}

function extractTableName(query) {
  if (/sale/i.test(query)) return "sales";
  if (/customer/i.test(query)) return "customers";
  return "sales"; 
}

function executePseudoQuery(pseudoSql) {
  
  if (/SELECT COUNT\(\*\) FROM/i.test(pseudoSql)) {
    const table = pseudoSql.match(/FROM (\w+)/i)[1];
    if (/WHERE/i.test(pseudoSql)) {
      const whereClause = pseudoSql.split('WHERE')[1];
      const filtered = mockDatabase[table].filter(item => evaluateWhereClause(item, whereClause));
      return [{ count: filtered.length }];
    }
    return [{ count: mockDatabase[table].length }];
  }
  

  if (/SELECT \* FROM/i.test(pseudoSql)) {
    const table = pseudoSql.match(/FROM (\w+)/i)[1];
    if (/WHERE/i.test(pseudoSql)) {
      const whereClause = pseudoSql.split('WHERE')[1];
      return mockDatabase[table].filter(item => evaluateWhereClause(item, whereClause));
    }
    return mockDatabase[table];
  }
  
  
  if (/SELECT (SUM|AVG)\((\w+)\) FROM/i.test(pseudoSql)) {
    const [, func, field] = pseudoSql.match(/SELECT (SUM|AVG)\((\w+)\) FROM/i);
    const table = pseudoSql.match(/FROM (\w+)/i)[1];
    const values = mockDatabase[table].map(item => item[field]);
    
    if (func === 'SUM') return [{ [`sum_${field}`]: values.reduce((a, b) => a + b, 0) }];
    if (func === 'AVG') return [{ [`avg_${field}`]: values.reduce((a, b) => a + b, 0) / values.length }];
  }
  
  
  if (/GROUP BY/i.test(pseudoSql)) {
    const [selectPart, groupPart] = pseudoSql.split('GROUP BY');
    const table = selectPart.match(/FROM (\w+)/i)[1];
    const groupField = groupPart.trim();
    
    let aggField, aggType;
    if (/SUM\((\w+)\)/i.test(selectPart)) {
      aggField = selectPart.match(/SUM\((\w+)\)/i)[1];
      aggType = 'sum';
    } else if (/COUNT\((\w+)\)/i.test(selectPart)) {
      aggField = selectPart.match(/COUNT\((\w+)\)/i)[1];
      aggType = 'count';
    }
    
    const grouped = mockDatabase[table].reduce((acc, item) => {
      const key = item[groupField];
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
    
    return Object.entries(grouped).map(([key, items]) => ({
      [groupField]: key,
      [`${aggType}_${aggField}`]: aggType === 'sum' 
        ? items.reduce((sum, item) => sum + item[aggField], 0)
        : items.length
    }));
  }
  
  return [];
}

function evaluateWhereClause(item, whereClause) {
  const conditions = whereClause.split('AND');
  return conditions.every(cond => {
    if (cond.includes(">=")) {
      const [field, value] = cond.split(">=").map(s => s.trim().replace(/['"]/g, ''));
      return item[field] >= value;
    }
    if (cond.includes("<=")) {
      const [field, value] = cond.split("<=").map(s => s.trim().replace(/['"]/g, ''));
      return item[field] <= value;
    }
    if (cond.includes("=")) {
      const [field, value] = cond.split("=").map(s => s.trim().replace(/['"]/g, ''));
      return item[field] == value;
    }
    return true;
  });
}

function validateQuery(query) {
  const validationNotes = [];
  let isValid = true;
  
  const table = extractTableName(query);
  if (!mockDatabase[table]) {
    validationNotes.push(`Table '${table}' not found`);
    isValid = false;
  }
  
  const complexOps = ["join", "subquery", "having", "with"];
  complexOps.forEach(op => {
    if (new RegExp(op, 'i').test(query)) {
      validationNotes.push(`Complex operation '${op}' might not be supported`);
      isValid = false;
    }
  });
  
  if (mockDatabase[table]?.length > 0) {
    const sampleItem = mockDatabase[table][0];
    const words = query.match(/\b[a-zA-Z_]+\b/g) || [];
    words.forEach(word => {
      if (!(word.toLowerCase() in sampleItem) && 
          !['select', 'from', 'where', 'and', 'or', 'group', 'by', 'sum', 'avg', 'count'].includes(word.toLowerCase())) {
        validationNotes.push(`Field '${word}' not found in table '${table}'`);
        isValid = false;
      }
    });
  }
  
  return { isValid, validationNotes };
}


app.post('/token', (req, res) => {
  const { username, password } = req.body;
  const user = fakeUsersDb[username];
  
  if (!user || !bcrypt.compareSync(password, user.hashedPassword)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  
  const token = jwt.sign(
    { sub: user.username },
    SECRET_KEY,
    { expiresIn: `${ACCESS_TOKEN_EXPIRE_MINUTES}m` }
  );
  
  res.json({ access_token: token, token_type: "bearer" });
});

app.post('/query', authenticateToken, (req, res) => {
  try {
    const start = Date.now();
    const { query } = req.body;
    
    const pseudoSql = translateNaturalToPseudoSql(query);
    const result = executePseudoQuery(pseudoSql);
    
    res.json({
      original_query: query,
      translated_query: pseudoSql,
      result: result,
      execution_time_ms: Date.now() - start
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/explain', authenticateToken, (req, res) => {
  try {
    const { query } = req.body;
    const pseudoSql = translateNaturalToPseudoSql(query);
    
    const steps = [
      `Identified query type: ${query.substring(0, 30)}${query.length > 30 ? '...' : ''}`,
      "Determined relevant tables and fields",
      `Translated to database query: ${pseudoSql}`,
      "Optimized query execution plan"
    ];
    
    const limitations = [];
    if (/join/i.test(query)) limitations.push("Joins might be limited");
    if (/group by/i.test(pseudoSql)) limitations.push("Grouping may impact performance");
    
    res.json({
      original_query: query,
      query_steps: steps,
      potential_limitations: limitations
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/validate', authenticateToken, (req, res) => {
  try {
    const { query } = req.body;
    const { isValid, validationNotes } = validateQuery(query);
    
    res.json({
      original_query: query,
      is_valid: isValid,
      validation_notes: validationNotes
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.json({ message: "Gen AI Analytics Simulation API" });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});