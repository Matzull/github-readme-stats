#!/usr/bin/env node

import { fetchTopLanguages } from "../src/fetchers/top-languages.js";

// Load .env when dotenv is available; keep script usable without local deps.
try {
  await import("dotenv/config");
} catch {
  // ignore missing dotenv
}

const args = process.argv.slice(2);

const getArgValue = (name, defaultValue = undefined) => {
  const prefix = `--${name}=`;
  const valueArg = args.find((arg) => arg.startsWith(prefix));
  if (!valueArg) {
    return defaultValue;
  }
  return valueArg.slice(prefix.length);
};

const getMultiArgValues = (name) => {
  const prefix = `--${name}=`;
  return args
    .filter((arg) => arg.startsWith(prefix))
    .flatMap((arg) => arg.slice(prefix.length).split(","))
    .map((value) => value.trim())
    .filter(Boolean);
};

const hasFlag = (name) => args.includes(`--${name}`);

const username = getArgValue("username") || args[0];
const limit = Number.parseInt(getArgValue("limit", "10"), 10);
const sizeWeight = Number.parseFloat(getArgValue("size-weight", "1"));
const countWeight = Number.parseFloat(getArgValue("count-weight", "0"));
const excludeRepo = getMultiArgValues("exclude-repo");
const hide = getMultiArgValues("hide");

if (!username) {
  console.error("Usage: node scripts/debug-top-langs.js --username=<github_user> [--limit=10] [--size-weight=1] [--count-weight=0] [--exclude-repo=a,b] [--hide=lang1,lang2] [--exclude-notebooks]");
  process.exit(1);
}

if (!process.env.PAT_1) {
  console.error("Missing PAT_1. Set it in your environment or .env file before running this script.");
  process.exit(1);
}

if (hasFlag("exclude-notebooks")) {
  hide.push("Jupyter Notebook");
}

const dedupedHide = [];
const hiddenLangs = new Set();
for (const lang of hide) {
  const normalized = lang.toLowerCase();
  if (!hiddenLangs.has(normalized)) {
    hiddenLangs.add(normalized);
    dedupedHide.push(lang);
  }
}

const main = async () => {
  const topLangs = await fetchTopLanguages(
    username,
    excludeRepo,
    Number.isNaN(sizeWeight) ? 1 : sizeWeight,
    Number.isNaN(countWeight) ? 0 : countWeight,
  );

  const filtered = Object.values(topLangs)
    .filter((lang) => !hiddenLangs.has(lang.name.toLowerCase()))
    .sort((a, b) => b.size - a.size);

  const effectiveLimit = Number.isNaN(limit) ? 10 : Math.max(limit, 1);
  const top = filtered.slice(0, effectiveLimit);
  const total = top.reduce((acc, lang) => acc + lang.size, 0);

  const rows = top.map((lang, index) => ({
    rank: index + 1,
    language: lang.name,
    score: Number(lang.size.toFixed(4)),
    percentage: total > 0 ? `${((lang.size / total) * 100).toFixed(2)}%` : "0.00%",
    repos: lang.count,
  }));

  const query = new URLSearchParams();
  query.set("username", username);
  query.set("langs_count", String(effectiveLimit));
  query.set("size_weight", String(Number.isNaN(sizeWeight) ? 1 : sizeWeight));
  query.set("count_weight", String(Number.isNaN(countWeight) ? 0 : countWeight));
  if (excludeRepo.length > 0) {
    query.set("exclude_repo", excludeRepo.join(","));
  }
  if (dedupedHide.length > 0) {
    query.set("hide", dedupedHide.join(","));
  }
  if (hasFlag("exclude-notebooks")) {
    query.set("exclude_notebooks", "true");
  }
  const equivalentUrl = `https://github-readme-stats.vercel.app/api/top-langs?${query.toString()}`;

  console.log(`Top languages for ${username}`);
  console.log(`size_weight=${Number.isNaN(sizeWeight) ? 1 : sizeWeight}, count_weight=${Number.isNaN(countWeight) ? 0 : countWeight}`);
  if (excludeRepo.length > 0) {
    console.log(`exclude_repo=${excludeRepo.join(",")}`);
  }
  if (dedupedHide.length > 0) {
    console.log(`hide=${dedupedHide.join(",")}`);
  }

  if (rows.length === 0) {
    console.log("No languages found with the current filters.");
    console.log(`Equivalent card URL: ${equivalentUrl}`);
    return;
  }

  console.table(rows);
  console.log(`Equivalent card URL: ${equivalentUrl}`);
};

main().catch((error) => {
  console.error("Failed to fetch top languages:");
  console.error(error.message || error);
  process.exit(1);
});
