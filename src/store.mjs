// Agent records on disk (data/agents.json), with atomic writes and the visibility rules.
//
// status: "pending"  — created by a visitor, waiting for review (only its creator sees it)
//         "approved" — reviewed, shown to everyone
//         "hidden"   — removed by the admin, shown to no one
// A launched agent (launch.ca set) is public unless hidden: launching costs real ETH.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function createStore(dataDir) {
  const file = path.join(dataDir, "agents.json");
  const seed = path.join(dataDir, "agents.example.json");
  if (!fs.existsSync(file) && fs.existsSync(seed)) fs.copyFileSync(seed, file); // fresh checkout: start from the examples
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, "utf8")); } catch { list = []; }
  for (const a of list) {
    if (a.example) a.status = "approved";
    else if (!["pending", "approved", "hidden"].includes(a.status)) a.status = "pending";
    a.skills ||= [];
  }

  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tmp = file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(list, null, 1));
      fs.renameSync(tmp, file);
    }, 150);
  };

  const isPublic = (a) => a.status !== "hidden" && (a.example || a.status === "approved" || !!a.launch?.ca);

  return {
    all: () => list,
    get: (id) => list.find((a) => a.id === id),
    isPublic,
    visible(mineIds = []) {
      const mine = new Set(mineIds);
      return list.filter((a) => isPublic(a) || (mine.has(a.id) && a.status !== "hidden"));
    },
    add(fields) {
      const agent = { id: crypto.randomBytes(6).toString("hex"), skills: [], createdAt: new Date().toISOString(), ...fields };
      list.unshift(agent); save(); return agent;
    },
    update(id, patch) {
      const a = list.find((x) => x.id === id); if (!a) return null;
      Object.assign(a, patch); save(); return a;
    },
    remove(id) {
      const i = list.findIndex((x) => x.id === id); if (i < 0) return false;
      list.splice(i, 1); save(); return true;
    },
    flush() { clearTimeout(timer); fs.writeFileSync(file, JSON.stringify(list, null, 1)); },
  };
}

// Public shape: never leak the creator's IP or internal notes.
export function publicAgent(a, { mine = false } = {}) {
  const { ip, ...rest } = a;
  return { ...rest, mine: mine || undefined };
}
