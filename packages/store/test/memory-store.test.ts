import { createMemoryStore } from "../src";
import { runStoreContract } from "./contract";

runStoreContract("memory", async () => createMemoryStore());
