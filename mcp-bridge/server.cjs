const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let state = {
  task: null,
  context: {}
};

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/mcp", (req, res) => {
  const { method, params } = req.body || {};

  if (method === "set_current_task") {
    state.task = params;
    return res.json({ success: true, task: state.task });
  }

  if (method === "get_bridge_snapshot") {
    return res.json(state);
  }

  if (method === "set_project_context") {
    state.context = params;
    return res.json({ success: true, context: state.context });
  }

  res.status(400).json({ error: "unknown method" });
});

app.listen(3001, () => {
  console.log("MCP server running on http://localhost:3001");
});