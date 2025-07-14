const express = require('express');
const XLSX = require('xlsx');
const cors = require('cors');
const app = express();
const PORT = 3000;
app.use(cors());
const workbook = XLSX.readFile('./charades_data.xlsx');
app.listen(PORT,()=>{console.log(`Server is running on http://localhost:${PORT}`)});
function getFirstColumnData(sheetName)
{
    const worksheet= workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet,{header:1});
    return data.map(row=>row[0]).filter(Boolean);
}
app.get('/movies',(req,res)=>
    {const movies = getFirstColumnData('Movies');
res.json(movies);
});
app.get('/words',(req,res)=>
{
    const words= getFirstColumnData('Words');
    res.json(words);
});
