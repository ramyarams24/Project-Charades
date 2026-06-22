require('dotenv').config();
const express = require('express');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const app = express();
const PORT = 3000;
app.use(cors());
const workbookPath = path.join(__dirname, 'charades_data.xlsx');
const workbook = XLSX.readFile(workbookPath);
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

// ---- AI-generated movie names (Anthropic Claude) ----

// Categories the player can pick from. The label is shown to users;
// the prompt tells Claude what kind of titles to generate.
const MOVIE_CATEGORIES = {
    hollywood: 'popular Hollywood (English-language) movies that most people would recognise',
    bollywood: 'popular Bollywood (Hindi-language) movies that most people would recognise',
    animated:  'well-known animated / family movies',
    classics:  'classic movies from the 1980s and 1990s',
    action:    'famous action and adventure movies',
    mixed:     'a varied mix of widely recognised movies across genres and eras',
};

// Created lazily so the server still boots (and /movies, /words keep working)
// even when ANTHROPIC_API_KEY is not set.
let anthropic = null;
function getClient() {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!anthropic) anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env
    return anthropic;
}

// Expose the list of categories for the frontend to build a picker.
app.get('/movies/ai/categories', (req, res) => {
    res.json(Object.keys(MOVIE_CATEGORIES));
});

// GET /movies/ai?category=bollywood&count=20  ->  ["Movie 1", "Movie 2", ...]
app.get('/movies/ai', async (req, res) => {
    const client = getClient();
    if (!client) {
        return res.status(503).json({
            error: 'AI movie generation is not configured. Set ANTHROPIC_API_KEY and restart the server.',
        });
    }

    const category = MOVIE_CATEGORIES[req.query.category] ? req.query.category : 'mixed';
    const description = MOVIE_CATEGORIES[category];

    let count = parseInt(req.query.count, 10);
    if (!Number.isFinite(count)) count = 20;
    count = Math.min(40, Math.max(5, count)); // clamp 5..40

    try {
        const response = await client.messages.create({
            // Haiku 4.5 is the cheapest model and is well-suited to simple
            // list generation like this. Note: the `effort` parameter is NOT
            // supported on Haiku and would 400, so it is omitted here.
            model: 'claude-haiku-4-5',
            max_tokens: 2048,
            output_config: {
                format: {
                    type: 'json_schema',
                    schema: {
                        type: 'object',
                        properties: {
                            movies: { type: 'array', items: { type: 'string' } },
                        },
                        required: ['movies'],
                        additionalProperties: false,
                    },
                },
            },
            messages: [
                {
                    role: 'user',
                    content:
                        `Generate exactly ${count} ${description}, suitable for a game of charades. ` +
                        `Each entry must be only the movie's title (no year, no extra text). ` +
                        `Do not repeat titles.`,
                },
            ],
        });

        const textBlock = response.content.find((b) => b.type === 'text');
        const data = JSON.parse(textBlock.text);
        const movies = Array.isArray(data.movies)
            ? data.movies.filter((m) => typeof m === 'string' && m.trim().length > 0)
            : [];

        if (movies.length === 0) {
            return res.status(502).json({ error: 'The AI returned no usable movie titles. Try again.' });
        }
        res.json(movies);
    } catch (err) {
        console.error('AI movie generation failed:', err);
        res.status(502).json({ error: 'Failed to generate movies from the AI service.' });
    }
});
