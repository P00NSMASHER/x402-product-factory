'use strict';
// Curated *workflow hypotheses*, not independently verified buyer requirements or product sales.
// Everything generated stays within the existing document-workflow engine and release HOLD.
const {validateRecipe}=require('../kernel');
const requireDoc=(id,label,renewable=false)=>({id,label,renewable});
const DATA=[
  ['vendor-coverage','Vendor Coverage','Small distributors collecting supplier paperwork','Vendor',
   'supplier identity and supporting documents','expiring supplier coverage details','supplier onboarding handoff',
   [['business-details','Business details'],['insurance','Insurance document',true],['terms','Supplier terms acknowledgement']]],
  ['contractor-quals','Contractor Qualifications','Facility operators coordinating independent contractors','Contractor',
   'contractor qualification records','expiring contractor qualifications','contractor mobilization approval',
   [['insurance','Insurance document',true],['qualification','Trade qualification',true],['site-rules','Site rules acknowledgement']]],
  ['agency-assets','Agency Creative Assets','Marketing agencies onboarding design projects','Project',
   'new campaign briefs and brand references','outdated account authorization references','campaign launch handoff',
   [['brief','Creative project brief'],['brand-kit','Brand file references'],['authorization','Project authorization',true]]],
  ['fleet-services','Fleet Service Records','Fleet teams managing service paperwork','Vehicle',
   'service job records for company vehicles','expiring vehicle service certificates','completed fleet service handoff',
   [['service-log','Service record'],['inspection','Inspection receipt',true],['warranty','Warranty reference']]],
  ['facility-maintenance','Facility Maintenance','Building service coordinators','Site',
   'service provider work orders and site records','expiring site access and service approvals','facility work-order closeout',
   [['scope','Work scope'],['access','Site access authorization',true],['completion','Completion receipt']]],
  ['commercial-cleaning','Cleaning Service Records','Commercial cleaning service managers','Client site',
   'new client site instructions and checklists','expiring service access documents','client-site service handoff',
   [['service-scope','Service scope'],['insurance','Coverage record',true],['site-plan','Site instructions']]],
  ['property-contracts','Property Vendor Records','Property management teams coordinating maintenance vendors','Property',
   'property vendor paperwork and approval records','expiring property vendor coverage','property vendor assignment handoff',
   [['work-scope','Work scope'],['insurance','Vendor insurance record',true],['approval','Property manager approval']]],
  ['event-vendors','Event Vendor Desk','Event organizers coordinating booked vendors','Event vendor',
   'event vendor setup documents','expiring event vendor permits','event vendor check-in',
   [['vendor-profile','Vendor information'],['coverage','Coverage evidence',true],['logistics','Setup and arrival plan']]],
  ['franchise-records','Franchise Location Records','Multi-location operators coordinating store paperwork','Location',
   'location-level reference documents','expiring location permits','new location handoff',
   [['location-profile','Location profile'],['permit','Local permit record',true],['operations','Operations acknowledgement']]],
  ['wholesale-dealers','Wholesale Dealer Desk','Wholesale businesses onboarding resellers','Dealer',
   'dealer account onboarding files','expiring resale documents','dealer activation handoff',
   [['dealer-profile','Dealer company profile'],['resale','Resale certificate',true],['terms','Dealer terms acknowledgement']]],
  ['printing-orders','Print Production Intake','Commercial print shops preparing client orders','Print job',
   'print production files and approvals','outdated proof authorizations','press-ready order handoff',
   [['job-brief','Order details'],['artwork','Artwork reference'],['proof','Proof approval',true]]],
  ['equipment-rental','Equipment Rental Records','Equipment rental providers handling business customers','Rental',
   'new rental customer job documents','expiring equipment rental authorizations','rental return handoff',
   [['rental-spec','Rental specification'],['coverage','Rental coverage evidence',true],['condition','Equipment condition record']]],
  ['exhibit-partners','Exhibitor Intake','Trade show organizers onboarding exhibitors','Exhibitor',
   'exhibitor setup and shipment instructions','expiring exhibitor approvals','exhibitor booth readiness handoff',
   [['booth-plan','Booth plan'],['insurance','Exhibitor insurance record',true],['shipping','Freight and shipping instructions']]],
  ['calibration-logs','Calibration Documentation','Operations teams scheduling equipment calibration','Instrument',
   'instrument service certificates and records','expiring calibration intervals','calibration service closeout',
   [['equipment','Instrument identification'],['certificate','Calibration certificate',true],['notes','Service notes']]],
  ['retail-permits','Retail Location Paperwork','Retail operations coordinators','Store',
   'store opening records and administrative documents','expiring store operating permits','store readiness handoff',
   [['site-details','Store location details'],['permit','Operating permit evidence',true],['opening-plan','Opening checklist']]],
  ['work-orders','Service Work Orders','Small service companies managing completed jobs','Service job',
   'job details and service instructions','expiring job service authorizations','service completion handoff',
   [['service-order','Service order'],['approval','Job authorization',true],['completion','Completion evidence']]],
  ['field-installers','Field Installer Records','Equipment installers coordinating field teams','Installation',
   'installation packets and site prerequisites','expiring site authorizations','installation sign-off',
   [['site-plan','Site access plan'],['authorization','Installation authorization',true],['completion','Installation completion reference']]],
  ['distribution-accounts','Distributor Account Desk','Industrial distributors opening business accounts','Account',
   'business account document packets','expiring buyer documentation','account activation handoff',
   [['company','Buyer company details'],['credit-terms','Business terms approval',true],['ship-to','Delivery instructions']]],
  ['catering-partners','Catering Vendor Intake','Event caterers coordinating external suppliers','Supplier',
   'supplier specifications and delivery records','expiring supplier credentials','catering order handoff',
   [['food-spec','Supplier item specification'],['permit','Vendor license evidence',true],['delivery','Delivery schedule']]],
  ['landscape-providers','Landscape Vendor Records','Property services operators booking landscaping vendors','Landscape site',
   'service agreements and property instructions','expiring landscaping vendor coverage','landscape service handoff',
   [['site-details','Property site details'],['insurance','Provider insurance record',true],['scope','Service scope']]],
  ['venue-production','Venue Production Desk','Live-event venue operations teams','Production event',
   'production schedules and technical requirements','expiring production approvals','stage setup handoff',
   [['production-plan','Production schedule'],['rigging','Stage authorization',true],['vendor-contact','Vendor coordination checklist']]],
  ['creative-clients','Creative Client Intake','Independent creative studios','Client project',
   'client briefs and requested source materials','outdated client approvals','creative project delivery handoff',
   [['brief','Client project brief'],['source-files','Source file inventory'],['signoff','Client approval reference',true]]],
  ['storage-providers','Warehouse Partner Records','Ecommerce retailers working with warehouses','Warehouse partner',
   'warehouse operating instructions and access documents','expiring warehouse authorization records','warehouse transition handoff',
   [['partner-profile','Warehouse details'],['coverage','Facility coverage record',true],['handling','Handling and packing instructions']]],
  ['nonprofit-grants','Grant Deliverables Desk','Small nonprofit grant administrators','Grant project',
   'grant deliverable packets and schedules','expiring grant reporting approvals','grant milestone handoff',
   [['deliverables','Deliverables list'],['reporting','Reporting approval',true],['receipts','Supporting receipt inventory']]]
];
const modes=[
 ['intake',' Intake',7,3,30,'Collect'],
 ['renewals',' Renewals',14,5,45,'Monitor'],
 ['handoff',' Handoff',10,3,21,'Prepare']
];
function buildCandidateCatalog(){
 const result=[];
 for(const [id,title,buyer,recordLabel,intake,renewal,handoff,documents] of DATA){
  for(const [mode,suffix,due,reminder,window,verb] of modes){
   const idValue=id+'-'+mode;
   const requirements=documents.map(([doc,label,renewable=false])=>requireDoc(doc,label,renewable));
   if(mode==='handoff')requirements.push(requireDoc('handoff-signoff','Final handoff sign-off'));
   const goal=mode==='intake'?intake:mode==='renewals'?renewal:handoff;
   const record={
    version:1,family:'document-workflow',id:idValue,title:title+suffix,buyer,
    outcome:verb+' '+goal+' for '+buyer.toLowerCase()+'.',
    recordLabel,defaultDueDays:due,reminderEveryDays:reminder,renewalWindowDays:window,
    requirements
   };
   result.push(validateRecipe(record));
  }
 }
 // Keep the exported collection writable for caller convenience without modifying static catalog state.
 return result.map(record=>JSON.parse(JSON.stringify(record)));
}
module.exports={buildCandidateCatalog};
