// Where accounts are kept.
//
// - MONGODB_URI set: MongoDB (e.g. a free Atlas cluster). Survives restarts on
//   hosts with throwaway disks, such as Render's free plan.
// - Otherwise: a JSON file (USERS_FILE, default ./.data/users.json) for local use.
//
// Records look like { email, businessName, salt, hash, createdAt }.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

export class DuplicateUserError extends Error {}

// ---------- MongoDB ----------
function mongoStore(uri) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  let ready = null;

  const collection = () => {
    if (!ready) {
      ready = (async () => {
        await client.connect();
        const users = client.db(process.env.MONGODB_DB || "udyam_digital").collection("users");
        await users.createIndex({ email: 1 }, { unique: true });
        return users;
      })().catch((e) => {
        ready = null; // retry on the next request
        throw e;
      });
    }
    return ready;
  };

  return {
    kind: "mongodb",
    async get(email) {
      const doc = await (await collection()).findOne({ email }, { projection: { _id: 0 } });
      return doc || null;
    },
    async create(email, record) {
      try {
        await (await collection()).insertOne({ email, ...record });
      } catch (e) {
        if (e.code === 11000) throw new DuplicateUserError(email);
        throw e;
      }
    },
  };
}

// ---------- JSON file ----------
function fileStore(file) {
  let users = null;
  const load = () => {
    if (!users) {
      try {
        users = new Map(Object.entries(JSON.parse(fs.readFileSync(file, "utf8"))));
      } catch (e) {
        if (e.code !== "ENOENT") console.error(`Could not read ${file}: ${e.message}`);
        users = new Map();
      }
    }
    return users;
  };
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(users), null, 2));
    fs.renameSync(tmp, file); // atomic replace so a crash can't leave half a file
  };
  return {
    kind: "file",
    async get(email) {
      const u = load().get(email);
      return u ? { email, ...u } : null;
    },
    async create(email, record) {
      if (load().has(email)) throw new DuplicateUserError(email);
      users.set(email, record);
      save();
    },
  };
}

const defaultFile = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".data", "users.json");

export const userStore = process.env.MONGODB_URI
  ? mongoStore(process.env.MONGODB_URI)
  : fileStore(path.resolve(process.env.USERS_FILE || defaultFile));
