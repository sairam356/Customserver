const express = require('express');

const app = express();
const port = 9090;

app.use(express.json());

// Endpoint to handle user's prompt and create a new thread
app.get('/prompt', async (req, res) => {

    try {

    res.status(200).json({"lang":" Node Tyescript"});
} catch (error) {
    res.status(500).json({ error: error.message });
}

});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
