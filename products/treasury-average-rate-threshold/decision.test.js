"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {assessTreasuryRateThreshold}=require("./decision");
const E={available:true,found:true,ambiguous:false,matchCount:1,recordDate:"2026-09-30",selected:{securityDescription:"Total Marketable",averageInterestRatePercent:3.75}};
test("gte met",()=>assert.equal(assessTreasuryRateThreshold(E,{thresholdPercent:3.5,operator:"gte"}).decision,"threshold_met"));
test("gte not met",()=>assert.equal(assessTreasuryRateThreshold(E,{thresholdPercent:4,operator:"gte"}).decision,"threshold_not_met"));
test("lte met",()=>assert.equal(assessTreasuryRateThreshold(E,{thresholdPercent:4,operator:"lte"}).decision,"threshold_met"));
test("ambiguous security requires review",()=>{const e={...E,ambiguous:true,matchCount:2,selected:null};assert.equal(assessTreasuryRateThreshold(e,{thresholdPercent:4,operator:"gte"}).decision,"human_review");});
test("missing rate requires review",()=>{const e={...E,selected:{securityDescription:"Total Marketable",averageInterestRatePercent:null}};assert.ok(assessTreasuryRateThreshold(e,{thresholdPercent:4,operator:"gte"}).reasonCodes.includes("TREASURY_RATE_UNAVAILABLE"));});
