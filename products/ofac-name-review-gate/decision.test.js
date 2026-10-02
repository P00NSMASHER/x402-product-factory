"use strict";const test=require("node:test"),assert=require("node:assert/strict");const {assessOfacNameReview}=require("./decision");
test("candidate count above zero returns candidate_found",()=>{const r=assessOfacNameReview({available:true,totalCandidatesAboveThreshold:1,candidates:[{score:99}]},{minScore:90});assert.equal(r.decision,"candidate_found");});
test("zero candidates returns no_candidate",()=>{const r=assessOfacNameReview({available:true,totalCandidatesAboveThreshold:0,candidates:[]},{minScore:90});assert.equal(r.decision,"no_candidate");});
test("unavailable evidence requires human review",()=>{const r=assessOfacNameReview({available:false},{minScore:90});assert.equal(r.decision,"human_review");assert.ok(r.reasonCodes.includes("OFAC_EVIDENCE_UNAVAILABLE"));});
