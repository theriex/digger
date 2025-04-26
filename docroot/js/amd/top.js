/*global app, jt */
/*jslint browser, white, long, unordered */

//Top panel interface and actions
app.top = (function () {
    "use strict";

    var tddi = "topdlgdiv";  //default to app div used for display
    var inapp = true;  //unset for standalone account access from web
    var mgrs = {};  //general container for managers 
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.util.dfs("top", mgrfname, args);
    }
    function dotDispatch (dotref, ...args) {
        const mgrfun = dotref.split(".");
        return mgrs[mgrfun[0]][mgrfun[1]].apply(app.top, args); }


    ////////////////////////////////////////////////////////////
    // Local Account actions
    ////////////////////////////////////////////////////////////

    //Hub call queue manager.  One ongoing call per endpoint.
    mgrs.hcq = (function () {
        const rqs = {};  //request queues by queue name
        const montmos = {};  //call monitoring timeouts
        var reqnum = 1;
        function hclog (verb, endpoint, rqn, msg) {
            jt.log("hcqm " + verb + " " + endpoint + " " + rqn + " " + msg); }
        function dfltHFM (type, msg) {  //default hub function message
            jt.log("mgrs.hcq retfunc default " + type + ": " + msg); }
        function setCallMonitoringTimers (verb, qname, rqn) {
            const late = 7;  //seconds
            const kill = 60; //seconds
            montmos[qname + rqn] = setTimeout(function () {
                hclog(verb, qname, rqn, "resp wait > " + late + "seconds");
                montmos[qname + rqn] = setTimeout(function () {
                    hclog(verb, qname, rqn, "abandoned");
                    dequeue(qname, 408, "Request timed out. " +
                            "No response after " + kill + " seconds.");
                }, (kill - late) * 1000); }, late * 1000); }
        function clearCallMonitoringTimers (qname, rqn) {
            clearTimeout(montmos[qname + rqn]);
            montmos[qname + rqn] = null; }
        function startRequest (entry) {
            //do not log entry.dat, may be large or contain signin password.
            hclog(entry.v, entry.qn, entry.rn, "start hub request");
            setCallMonitoringTimers(entry.v, entry.qn, entry.rn);
            setTimeout(function () {  //separate call in case it just hangs.
                //svc calls back to hcq.hubResponse on completion.  Can have
                //multiple overlapping hub calls on different queues.
                app.svc.passthroughHubCall(entry.qn, entry.rn, entry.ep,
                                           entry.v, entry.dat); }, 50); }
        function dequeue (qname, code, det) {
            const entry = rqs[qname].shift();
            if(!rqs[qname].length) {   //processed last entry
                delete rqs[qname]; }   //so get rid of the queue
            else {  //process next entry after finishing callback for this one
                setTimeout(function () {
                    startRequest(rqs[qname][0]); }, 50); }
            if(code === 200) {
                entry.cf(JSON.parse(det)); }
            else {
                entry.ef(code, det); } }
    return {
        queueRequest: function (dets) {
            const entry = {qn:dets.endpoint,  //queue name for sequencing
                           rn:reqnum,         //request number for sequencing
                           ep:dets.url,       //endpoint url to call on hub
                           v:dets.verb,       //POST or GET
                           dat:dets.dat || "",   //data to use if POST
                           cf:dets.contf || function (res) {
                               dfltHFM("contf", JSON.stringify(res)); },
                           ef:dets.errf || function (code, text) {
                               dfltHFM("errf", code + ": " + text); }};
            if(entry.qn.startsWith("/")) {  //send&receive plain endpoint name
                entry.qn = entry.qn.slice(1); }
            hclog(entry.v, entry.qn, entry.rn, "queue hubRequest");
            reqnum += 1;
            if(rqs[entry.qn]) {  //existing request(s) pending
                rqs[entry.qn].push(entry); }  //process in turn
            else {  //queueing a new request
                rqs[entry.qn] = [entry];
                startRequest(entry); } },
        hubResponse: function (qname, reqnum, code, det) {
            var respdet = "ok";
            if(code !== 200) {
                respdet = code + ": " + jt.ellipsis(det, 255); }
            hclog("RESP", qname, reqnum, respdet);
            clearCallMonitoringTimers(qname, reqnum);
            const entries = rqs[qname];
            if(!entries || !entries.length) {
                hclog("PUNT", qname, reqnum, "No entries for qname " + qname);
                return; }
            if(!entries[0]) {
                hclog("PUNT", qname, reqnum, "bad first entry: " + entries[0]);
                return; }
            if(entries[0].rn !== reqnum) {
                return hclog("PUNT", qname, reqnum, "ignored response, " +
                             " expected reqnum " + rqs[qname][0].rn); }
            dequeue(qname, code, det); }
    };  //end mgrs.hcq returned functions
    }());


    //General hub communication utilities
    mgrs.hcu = (function () {
        //account JSON fields
        const ajfs = {kwdefs:{cmp:["pos", "ig", "dsc"]},
                      igfolds:{},
                      settings:{cmp:["waitcodedays", "sumact"]},
                      hubdat:{},
                      musfs:{cmp:["dsId", "email", "firstname", "hashtag"]}};
        const ncpy = {settings:{ctrls:null, deck:null}};
        const verstat = {};
        function removeOptionalServerFields (acct) {
            delete acct.syncsince; }
        function removeUnusedLegacyFields (acct) {
            if(acct.settings) {  //delete legacy settings data now in digdat
                delete acct.settings.ctrls;
                delete acct.settings.deck; } }
        function equivField (fld, a, b) {  //compare deserialized objs
            if(fld && ajfs[fld] && ajfs[fld].cmp) {
                return ajfs[fld].cmp.every((f) => ((a[f] === b[f]) ||
                           (JSON.stringify(a[f]) === JSON.stringify(b[f])))); }
            return JSON.stringify(a[fld]) === JSON.stringify(b[fld]); }
        function updateLastSyncPlayback (lp) {
            const dbo = app.pdat.dbObj();
            if(!dbo.lastSyncPlayback || dbo.lastSyncPlayback < lp) {
                dbo.lastSyncPlayback = lp; } }
    return {
        serializeAccount: function (acct) {
            Object.keys(ajfs).forEach(function (sf) {
                if(acct[sf] && typeof acct[sf] !== "string") {
                    acct[sf] = JSON.stringify(acct[sf]); } }); },
        deserializeAccount: function (acct) {
            Object.keys(ajfs).forEach(function (sf) {
                if(acct[sf] && typeof acct[sf] === "string") {
                    acct[sf] = JSON.parse(acct[sf]); } }); },
        verifyDefaultAccountFields: function (acct) {
            const da = mgrs.aaa.getDefaultAccount();
            Object.keys(ajfs).forEach(function (df) {
                acct[df] = acct[df] || da[df] || ""; }); },
        accountDisplayDiff: function (a, b) {
            if(!a || !b) { return false; }  //nothing to compare
            const changed = Object.keys(ajfs).find((fld) =>
                !equivField(fld, a, b));
            return changed || false; },
        copyUpdatedAcctData: function (destAcct, srcAcct, skipflds) {
            //copy field values from srcAcct into destAcct, except for skipflds
            removeOptionalServerFields(destAcct);
            skipflds = skipflds || ncpy;
            Object.keys(srcAcct).forEach(function (key) {
                if(skipflds.hasOwnProperty(key)) {  //skip field or drill in
                    if(skipflds[key]) { //recurse down to subfields
                        destAcct[key] = destAcct[key] || {};
                        srcAcct[key] = srcAcct[key] || {};
                        mgrs.hcu.copyUpdatedAcctData(destAcct[key],
                                                     srcAcct[key],
                                                     skipflds[key]); } }
                else {  //not a skip field, copy field value
                    if(typeof srcAcct[key] === "object") {  //obj or array
                        if(srcAcct[key])  {  //skip copying if null src val
                            destAcct[key] = JSON.parse(
                                JSON.stringify(srcAcct[key])); } }
                    else {
                        destAcct[key] = srcAcct[key]; } } });
            removeUnusedLegacyFields(destAcct); },
        saveSongUpdatesFromHub: function (callerstr, songs) {
            if(!songs) { return; }
            if(!Array.isArray(songs)) { songs = [songs]; }
            if(!songs.length) { return; }
            const sd = app.pdat.songsDict();
            songs.forEach(function (hsg) {  //walk each hub received song
                var upds = [];  //local songs to update
                if(hsg.path && sd[hsg.path]) {  //update specific song only
                    upds = [sd[hsg.path]]; }
                else { //update all matching songs
                    upds = app.pdat.tiarabLookup(hsg); }
                upds.forEach(function (lsg) {  //walk each matching local song
                    var mrlp = hsg.lp;    //most recent last playback
                    if(lsg.lp > mrlp) {   //if local more recent than hub,
                        mrlp = lsg.lp; }  //keep the local lp value
                    app.util.copyUpdatedSongData(lsg, hsg);
                    lsg.lp = mrlp;
                    updateLastSyncPlayback(hsg.lp); }); });
            app.pdat.writeDigDat(callerstr); },
        makeHubCall: function (endpoint, dets) {  //verb, dat, contf, errf
            const ves = ["newacct", "acctok", "updacc", "mailpwr", "deleteme",
                         "suggdown", "nosugg", /bd\d\d\d\S\S\S/,
                         mgrs.srs.hubSyncAPIEndpointRegex(),
                         "fanmsg", "fancollab", "fangrpact"];
            if(!ves.some((e) => endpoint.match(e))) {
                return jt.log("makeHubCall unknown endpoint: " + endpoint); }
            const verbs = ["GET", "POST", "rawGET"];
            if(!dets.verb || verbs.indexOf(dets.verb) < 0) {
                return jt.log("makeHubCall bad dets.verb: " + dets.verb); }
            if(dets.verb === "POST" && !dets.dat) {
                return jt.log("makeHubCall dets.dat required for POST"); }
            if(dets.verb === "GET" && !dets.url) {
                return jt.log("makeHubCall cache bust url required for GET"); }
            dets.contf = dets.contf || function (res) {
                jt.log("hcu.makeHubCall no contf " + endpoint +
                       " res: " + JSON.stringify(res || "")); };
            dets.errf = dets.errf || function (code, errtxt) {
                jt.log("hcu.makeHubCall " + endpoint + " " +
                       code + ": " + errtxt); };
            dets.endpoint = endpoint;  //short reference for routing
            dets.url = "/" + (dets.url || endpoint);
            mgrs.hcq.queueRequest(dets); },
        verifyClientVersion: function () {
            var curracct = mgrs.aaa.getAccount();
            if(curracct.hubVersion && curracct.diggerVersion) {
                verstat.hub = curracct.hubVersion;
                verstat.loc = curracct.diggerVersion;
                if(!verstat.notice && verstat.hub > verstat.loc) {
                    verstat.notice = true;
                    const indvplats = ["IOS", "Android"];
                    if(!indvplats.contains(app.svc.plat("audsrc"))) {
                        mgrs.gen.togtopdlg("la"); } }
                else {
                    verstat.notice = false; } } },
        getVersionStatus: function () {
            return verstat; }
    };  //end mgrs.hcu returned functions
    }());


    //Song rating data synchronization between local app and DiggerHub
    mgrs.srs = (function () {
        const syt = {tmo:null, stat:"", resched:false, up:0, down:0, hsc:{}};
        const contexts = {newacct:1800, acctok:1800, unposted:5000, reset:1200,
                          resched:8000, standard:20 * 1000, signin:100,
                          syncauth:100};
        const serverMaxUploadSongs = 20;
        var commstate = {action:"start", hsct:""};
        function isUploadableSong (s) {
            const dbo = app.pdat.dbObj();
            return (s.lp && s.lp > dbo.lastSyncPlayback &&
                    (!s.fq || !(s.fq.startsWith("D") ||
                                s.fq.startsWith("U"))) &&
                    !app.deck.isUnrated(s)); }
        function uploadableSongs () {
            const uploadsongs = Object.values(app.pdat.songsDict())
                  .filter((s) => isUploadableSong(s))
                  .sort((a, b) => a.lp.localeCompare(b.lp));
            return uploadsongs; }
        function showHubIndicator (show, statInfo) {
            if(show) {
                jt.out("modindspan", jt.tac2html(
                    ["a", {href:"#hubstatdetails", title:"Hub work details",
                           onclick:mdfs("gen.togtopdlg", "la", "open")},
                     ["span", {cla:"indicatorlightcolor"},
                      "hub"]])); }
            else {  //not showing hub indicator
                jt.out("modindspan", ""); }
            mgrs.srs.hubStatInfo(statInfo || ""); }
        function ucsv (str) {  //unescape csv string value
            str = str.replace(/"/g, "");  //remove any surrounding quotes
            str = jt.dec(str);
            return str; }
        function pciv (str) {  //parse csv int value
            const ival = parseInt(str, 10);
            // if(!(ival >= 0)) {  //uncomment to force crash when testing data
            //     throw new Error("Bad pciv str: " + str); }
            return ival; }
        function csv2song (csv) {
            //unpack the standard DiggerHub abbreviated song csv format
            const csvcnv = {dsId:ucsv, ti:ucsv, ar:ucsv, ab:ucsv,
                            el:pciv, al:pciv, kws:ucsv, rv:pciv, fq:ucsv,
                            nt:ucsv, lp:ucsv, pd:ucsv, pc:pciv};
            const cvals = csv.csvarray();  //break csv into its component values
            const song = {dsType:"Song", aid:mgrs.aaa.getAccount().dsId};
            Object.keys(csvcnv).forEach(function (key, idx) {
                song[key] = csvcnv[key](cvals[idx]); });
            mgrs.dbc.verifySong(song);  //bound minmax vals just in case
            return song; }
        function estr (str) { return "\"" + jt.enc(str) + "\""; }
        function cint (val) { return val; }
        function song2csv (song, txencode) {
            if(txencode) {
                song = app.util.txSong(song); }
            //pack into the standard DiggerHub abbreviated song csv format
            const csvcnv = {dsId:estr, ti:estr, ar:estr, ab:estr,
                            el:cint, al:cint, kws:estr, rv:cint, fq:estr,
                            nt:estr, lp:estr, pd:estr, pc:cint};
            const csv = Object.keys(csvcnv).map((k) => csvcnv[k](song[k]))
                  .join(",");
            return csv; }
        function restoreCSVSongData (csv) {
            const songs = csv.split("\n").map((c) => csv2song(c));
            app.pdat.dbObj().lastSyncPlayback = "1970-01-01T00:00:00Z";
            songs.forEach(function (bs) {  //backup song
                const locs = app.pdat.tiarabLookup(bs);
                locs.forEach(function (ds) {  //dictionary song
                    //jt.log("restoring " + bs.ti);
                    if(bs.lp > app.pdat.dbObj().lastSyncPlayback) {
                        app.pdat.dbObj().lastSyncPlayback = bs.lp; }
                    app.util.copyUpdatedSongData(ds, bs); }); });
            jt.log("restoreCSVSongData: " + songs.length + " songs"); }
        function getPendingUploadSongsCSVArray () {
            var upsgs = uploadableSongs();
            jt.log("getPendingUploadSongs: "  + upsgs.length + " songs");
            syt.pending = upsgs.length;
            upsgs = upsgs.slice(0, serverMaxUploadSongs);  //respect server
            upsgs = upsgs.map((s) => song2csv(s, "txencode"));
            return upsgs; }
        function logHubSyncSongs (verb, songcsvs) {
            const mxsgs = 3;
            var lls = songcsvs.slice(0, mxsgs);
            lls.unshift("DiggerHub sync " + verb + " lastSyncPlayback: " +
                        app.pdat.dbObj().lastSyncPlayback);
            if(songcsvs.length > mxsgs) {
                lls.push("... total of " + songcsvs.length + " songs"); }
            jt.log(lls.join("<br/>")); }
        function mergeCSVSongs (direction, songcsvs) {
            const songs = songcsvs.map((csv) => csv2song(csv));
            mgrs.hcu.saveSongUpdatesFromHub("srs.hubsyncmerge", songs);
            jt.log("mergeCSVSongs merged " + songs.length + " songs");
            syt[direction] += songs.length; }
        function handleSyncError (code, errtxt) {
            commstate = {action:"start", hsct:""};  //start over next time
            syt.errcode = code;
            syt.errtxt = errtxt;
            jt.log("srs.handleSyncError " + code + ": " + errtxt);
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                //Credentials are no longer valid, so this is old account info
                //and should not be attempting to sync.  To fix, the user will
                //need to sign in again.  Sign them out to start the process.
                mgrs.asu.processSignOut(); } }
        function hubSyncFinished () {
            syt.pcts = new Date().toISOString();
            syt.stat = "";
            syt.tmo = null;
            showHubIndicator(false, "");
            if(!syt.errcode) {  //no retry until song update or app restart
                syt.pending = uploadableSongs().length;
                if(syt.pending || syt.resched) {
                    syt.resched = false;
                    mgrs.srs.syncToHub("resched"); } } }
        function processHubSyncResult (resarray) {  //an array of strings
            var reschedContext = "standard";
            commstate = JSON.parse(resarray[0]);  //save updated commstate.hsct
            switch(commstate.action) {
            case "started":
                commstate.action = "pull";
                reschedContext = "syncauth";
                break;
            case "merge":
                if(commstate.provdat === "partial") {  //too much to sync
                    jt.log("srs.processHubSyncResult partial merge signout");
                    return mgrs.asu.processSignOut(); }
                mergeCSVSongs("down", resarray.slice(1));
                commstate.action = "upload"; //merge complete, ready to upload
                reschedContext = "syncauth";
                break;
            case "received":
                mergeCSVSongs("up", resarray.slice(1));
                commstate.action = "upload"; //uploads from here on if hsct ok
                reschedContext = "standard"; //let server breathe a few seconds
                break;
            default: jt.log("Unknown processHubSyncResult commstate.action: " +
                            commstate.action); }
            mgrs.srs.syncToHub(reschedContext); }  //continue or recheck
        function makeHubSyncCall (callobj) {
            jt.log("makeHubSyncCall syncdata[0]: " +
                   jt.ellipsis(callobj.syncdata[0], 60));
            //callob.syncdata is an array of strings. Stringify the array.
            callobj.syncdata = JSON.stringify(callobj.syncdata);
            const pdat = jt.objdata(callobj);
            jt.log("makeHubSyncCall pdat.length: " + pdat.length);
            syt.stat = "executing";  //hold any other calls to sync
            showHubIndicator(true, "calling...");
            syt.errcode = "";
            syt.errtxt = "";
            syt.hsc.start = Date.now();
            mgrs.hcu.makeHubCall(mgrs.srs.hubSyncEndpoint(), {
                verb:"POST", dat:pdat,
                contf:function (resarray) {
                    syt.hsc.end = Date.now();
                    mgrs.srs.hubStatInfo("updating...");
                    processHubSyncResult(resarray);
                    hubSyncFinished(); },
                errf:function (code, errtxt) {
                    syt.hsc.end = Date.now();
                    mgrs.srs.hubStatInfo("error");
                    handleSyncError(code, errtxt);
                    hubSyncFinished(); }}); }
        function hubSyncStart () { //see ../../docs/hubsyncNotes.txt
            var acct; var ucs;
            switch(commstate.action) {
            case "start":
                acct = mgrs.aaa.getAccount();
                if(acct.dsId === "101") {
                    return jt.log("hubSyncStart aborted since not signed in"); }
                return makeHubSyncCall({
                    syncdata:[JSON.stringify({action:"start"})],
                    email:acct.email, token:acct.token});
            case "pull":
                return makeHubSyncCall({
                    syncdata:[JSON.stringify({
                        action:"pull",
                        syncts:app.pdat.dbObj().lastSyncPlayback})],
                    hsct:commstate.hsct});
            case "upload":
                ucs = getPendingUploadSongsCSVArray();
                if(!ucs.length) {
                    jt.log("hubSyncStart no songs to upload.");
                    return hubSyncFinished(); }
                logHubSyncSongs("upload", ucs);
                return makeHubSyncCall({
                    syncdata:[JSON.stringify({action:"upload"}), ...ucs],
                    hsct:commstate.hsct});
            default: jt.log("Unknown hubSyncStart commstate.action: " +
                            commstate.action); } }
    return {
        noteDataRestorationNeeded: function () { syt.stat = "restoring"; },
        restoreFromBackup: function (srcstr) {
            commstate = {action:"start", hsct:""};  //start over next time
            const logpre = "restoreFromBackup ";
            const btm = Date.now();
            showHubIndicator(true, "restoring...");
            syt.stat = "restoring";  //avoid any interim sync
            const bdrdone = function () {  //end restore, check for updates
                syt.stat = "";  //allow regular sync to proceed
                mgrs.srs.syncToHub(srcstr); };
            const acct = mgrs.aaa.getAccount();
            if(!acct || !acct.settings || !acct.settings.backup ||
               !acct.settings.backup.url) {
                jt.log(logpre + "no acct.settings.backup.url");
                return bdrdone(); }
            const bdurl = acct.settings.backup.url;
            mgrs.hcu.makeHubCall(bdurl, {
                verb:"rawGET", url:app.util.cb(bdurl, app.util.authdata({})),
                contf:function (csv) {
                    jt.log(logpre + "csv receive ms: " + (Date.now() - btm));
                    showHubIndicator(false, "");
                    restoreCSVSongData(csv);
                    jt.log(logpre + "csv process ms: " + (Date.now() - btm));
                    app.pdat.writeDigDat("restoreFromBackup", null,
                        function (/*digdat*/) {
                            bdrdone(); },
                        function (code, errtxt) {
                            jt.log(logpre + "wdigdat " + code + ": " + errtxt);
                            bdrdone(); }); },
                errf:function (code, errtxt) {
                    showHubIndicator(false, "");
                    jt.log(logpre + "hub call failed " + code + ": " + errtxt);
                    bdrdone(); } }); },
        hubSyncEndpoint: function  () {  //matches main.py startpage route
            const curracct = mgrs.aaa.getAccount();
            return "da" + curracct.dsId; },  //previously "hubsync" API
        hubSyncAPIEndpointRegex: function () {
            return  /da\d\d\d+/; },  //allow 101 for testing purposes
        hubsyncBacklogCount: function () {
            if(!syt.pending || syt.pending < serverMaxUploadSongs) {
                return 0; }  //not backlogged, will handle in next call
            return syt.pending; },
        syncToHub: function (context) {
            if(syt.stat === "restoring") {
                return jt.log("top.srs.syncToHub no sync while restoring"); }
            if(context === "cancel" && syt.tmo) {
                clearTimeout(syt.tmo);
                syt.tmo = null;
                return; }
            mgrs.srs.hubStatInfo("scheduled.");
            if(syt.tmo) {  //already scheduled
                if(syt.stat) {  //currently running
                    syt.resched = true;  //reschedule when finished
                    return; }
                clearTimeout(syt.tmo); }  //not running. reschedule now
            syt.resched = false;
            syt.tmo = setTimeout(hubSyncStart,
                                 contexts[context] || contexts.standard); },
        makeStatusDisplay: function () {
            if(!jt.byId("hubSyncInfoDiv")) { return; }
            jt.out("hubSyncInfoDiv", jt.tac2html(
                [["span", {id:"hsilabspan", cla:"pathlabelgreyspan"},
                  "Hub Sync:"],
                 ["span", {id:"hsitsspan", cla:"infospan"}],  //timestamp
                 ["span", {id:"hsiudspan", cla:"infospan"}],  //updown
                 ["span", {id:"hsistatspan", cla:"infospan"}]]));  //status
            mgrs.srs.hubStatInfo(syt.err || "init"); },
        hubStatInfo: function (value) {
            if(!jt.byId("hsistatspan")) { return; }
            if(value === "init") {
                if(syt.stat) { value = "processing..."; }
                else if(syt.tmo) { value = "scheduled."; } }
            jt.out("hsistatspan", value);
            if(syt.pcts) {
                jt.out("hsitsspan",
                       jt.isoString2Time(syt.pcts).toLocaleTimeString()); }
            const pdisp = (syt.pending? (", -" + syt.pending + "w") : "");
            jt.out("hsiudspan", (pdisp +
                //use only unicode arrows supported on all browsers.
                                 ", <b>&#8593;</b>" + syt.up +
                                 ", <b>&#8595;</b>" + syt.down)); }
    };  //end mgrs.srs returned functions
    }());


    ////////////////////////////////////////////////////////////
    // General Account actions
    ////////////////////////////////////////////////////////////

    //Fan messaging actions manager handles collaborative messages
    mgrs.fma = (function () {
        const mstat = {msgs:[], ckd:new Date().toISOString()};
        const mds = {  //message definitions
            recommendation:{  //generated by "Get Recommendations" button
                pn:"Recommendation", desc:"$SONG. $COMMENT",
                actions:"dismiss, thxnrmv, emdet"},
            recresp:{  //sent in response to recommendation
                pn:"Thanks", desc:"For recommending $SONG.",
                actions:"dismiss, welnrmv"},
            recywel:{  //sent in closing response to recresp
                pn:"You're Welcome", desc:"Glad you liked $SONG",
                actions:"dismiss"},
            share:{  //someone in your fan group shared a song with you
                pn:"Share", desc:"$SONG. $COMMENT",
                actions:"dismiss, rspnrmv, emdet"},
            shresp:{  //sent in response to a share message
                pn:"Great Song!", desc:"$SONG",
                actions:"dismiss"},
            //PENDING: Hub processing for the following message types with
            //at most 1 msg/hr and 3 msg/day.
            discovery:{  //generated after adding a new common song
                pn:"Discovery", desc:"Just added $SONG. $COMMENT",
                actions:"dismiss"},
            pathcross:{  //generated after both played same great song recently
                pn:"Path Cross", desc:"Just listened to $SONG.",
                actions:"dismiss"}};
        const ads = {  //action definitions
            dismiss:{b:"Dismiss", o:"Dismissing", t:"Remove message"},
            thxnrmv:{b:"Thanks&Remove", o:"Sending thank you",
                     t:"Send thank you"},  //generates recresp
            welnrmv:{b:"You're Welcome", o:"Sending you're welcome",
                     t:"Send you're welcome message"}, //generates recywel
            rspnrmv:{b:"Respect&Remove", o:"Sending affirmation",
                     t:"Send song affirmation response"}, //generates shresp
            emdet:{b:"Mail Details", o:"Mailing message details",
                   t:"Email me message details"}};
        function callFanMessaging (msgaction, paramidcsv, ccontf, cerrf) {
            if(!app.util.haveHubCredentials()) {
                return cerrf(401,
                             "Sign in to DiggerHub for music fan messaging"); }
            mgrs.hcu.makeHubCall("fanmsg", {
                verb:"POST",
                dat:app.util.authdata({action:msgaction, idcsv:paramidcsv}),
                contf:ccontf,
                errf:cerrf}); }
        function resetStaleTime () {
            const dms = Date.now() + (60 * 1000);
            mstat.ckd = new Date(dms).toISOString(); }
        function rebuildWorkingMessages (msgs) {
            msgs = msgs || mstat.msgs;
            const musfs = mgrs.aaa.getAccount().musfs;
            msgs.forEach(function (msg) {  //fill sendername
                const mf = musfs.find((mf) => mf.dsId === msg.sndr);
                if(mf) { msg.sendername = mf.digname; } });
            msgs = msgs.filter((m) => m.sendername);  //curr fan grp msgs only
            msgs = msgs.filter((m) => m.status === "open");
            mstat.msgs = msgs; }
        function doneProcNote(dispid, note, ocstr) {
            jt.out(dispid, jt.tac2html(
                ["div", {cla:"donenotediv"},
                 [note, " ",
                  ["a", {href:"#ok", onclick:ocstr}, "Ok"]]])); }
        function isDupeRec(ra, rb) {
            if(!ra || !rb || ra.msgtype !== "recommendation" ||
               rb.msgtype !== "recommencation") {
                return false; }  //not a rec
            if(ra.status === "dismissed" || rb.status !== "dismissed") {
                return false; }  //not a dupe if already dismissed
            if((ra.sndr === rb.sndr) && (ra.songid === rb.songid)) {
                return false; }  //same message, not dupe
            if((ra.ti === rb.ti) && (ra.ar === rb.ar) && (ra.ab === rb.ab)) {
                return true; }
            return false; }
        function dedupeRecommendations (msgstatdiv) {
            //gets rid of one dupe per call.  User can get recs again.
            var dupefound = false;
            mstat.msgs.forEach(function (msg) {
                if(!dupefound && (msg.msgtype === "recommendation" &&
                                  msg.status === "open")) {
                    const dupe = mstat.msgs.find((rec) => isDupeRec(rec, msg));
                    if(dupe) {  //get rid of one dupe, user can get recs again.
                        dupefound = true;
                        mgrs.fma.hubAction("dismiss", msgstatdiv,
                                           dupe.dsId); } } }); }
    return {
        messages: function () { return mstat.msgs; },
        fetchMessagesIfStale: function (contf, errf) {
            if(mstat.ckd < new Date().toISOString()) {
                callFanMessaging("fetch", "",
                    function (msgs) {
                        resetStaleTime();
                        rebuildWorkingMessages(msgs);
                        contf(mstat.msgs); },
                    errf); } },
        redisplayMessages: function (idx) {
            resetStaleTime();
            mgrs.fga.messagesForm(mgrs.aaa.getAccount());
            if(Number.isFinite(idx)) {
                mgrs.fga.togActionsDisplay(idx, "fma.msgOpts"); } },
        getRecs: function (msgstatdiv) {
            const timewindowms = Date.now() - (3 * 24 * 60 * 60 * 1000);
            const thresh = new Date(timewindowms).toISOString();
            const addOrDismissMsg = "You already have recent recommendations.";
            const exrecs = mstat.msgs.filter((m) =>
                (m.msgtype === "recommendation" && m.status === "open" &&
                 m.created >= thresh));
            if(exrecs.length > 4) {
                return jt.out(msgstatdiv, addOrDismissMsg); }
            const mfids = mgrs.aaa.getAccount().musfs
                .filter((mf) => !exrecs.some((r) => r.sndr === mf.dsId))
                .sort(function (a, b) {
                    return b.lastheard.localeCompare(a.lastheard); })
                .map((mf) => mf.dsId)
                .join(",");
            if(!mfids) {
                if(exrecs.length) {
                    return jt.out(msgstatdiv, addOrDismissMsg); }
                return jt.out(msgstatdiv, "No fans to give recommendations."); }
            callFanMessaging("recommend", mfids,
                function (msgs) {
                    if(!msgs || !msgs.length) {
                        return jt.out("msgstatdiv",
                                   "Nobody has any recommendations today."); }
                    rebuildWorkingMessages(msgs.concat(mstat.msgs));
                    mgrs.fma.redisplayMessages();
                    jt.out("msgstatdiv", "Recommendations retrieved.");
                    dedupeRecommendations(msgstatdiv); },
                function (code, errtxt) {
                    jt.out(msgstatdiv, "Recommendations failed " + code +
                           ": " + errtxt); }); },
        msgTxt: function (val, ignore /*fld*/, obj, idx) {
            var txt; var comment = obj.nt || "";
            if(comment.length > 255) {
                comment = jt.tac2html(
                    ["span", {id:"expnt" + idx},
                     ["a", {href:"#expand",
                            onclick:mdfs("fga.expandComment", idx)},
                      jt.ellipsis(comment, 255)]]); }
            const md = mds[val] || {pn:val,
                                    desc:"Unknown message type"};
            txt = jt.tac2html(["span", {cla:"fmtypespan"}, md.pn]) +
                "&nbsp;" + md.desc;
            txt = txt.replace(/\$SONG/g, obj.ti + " by " + obj.ar);
            txt = txt.replace(/\$COMMENT/g, comment);
            return txt; },
        hubAction: function (actdefname, dispid, msgid) {
            jt.out(dispid, ads[actdefname].o + "...");
            callFanMessaging(actdefname, msgid,
                function (msgs) {
                    const um = msgs[0];
                    const mi = mstat.msgs.findIndex((m) => m.dsId === um.dsId);
                    um.sendername = mstat.msgs[mi].sendername;
                    mstat.msgs[mi] = um;
                    if(actdefname === "dismiss") {
                        mgrs.fma.redisplayMessages(); }
                    else {  //emdet, reply
                        doneProcNote(dispid, msgs[0].procnote,
                                     mdfs("fma.redisplayMessages")); } },
                function (code, errtxt) {
                    jt.out(dispid, ads[actdefname].b + " failed " + code +
                           ": " + errtxt); }); },
        msgOpts: function (dispid, msg) {
            // jt.log("msgOpts msgtype: " + msg.msgtype + ", actions: " +
            //        mds[msg.msgtype].actions);
            const actions = mds[msg.msgtype].actions.csvarray()
                .map((an) => (ads[an].dte? dotDispatch(ads[an].dte, msg) :
                                           ({name:an, def:ads[an]})));
            jt.out(dispid, jt.tac2html(
                ["div", {cla:"msgactionsdiv"},
                 actions.map((a) =>
                     ["button", {type:"button", title:a.def.t,
                                 onclick:mdfs((a.def.clk || "fma.hubAction"),
                                              a.name, dispid, msg.dsId)},
                      a.def.b])])); }
    };  //end mgrs.fma returned functions
    }());


    //Fan status calculation manager handles multi-stage server calcs
    mgrs.fsc = (function () {
        const fas = [  //fan actions
            {a:"deleteFan", n:"Delete", d:"Delete $FAN from your group"},
            {a:"getDefaultRatings", n:"Ratings", m:5,
             d:"Fill default song ratings from $FAN"},
            {a:"recomputeFanCounts", n:"Recount", m:20,
             d:"Recompute collection common/received/sent"}];
        var mfps = {}; //music fan processing status
        var matchFormViewed = "";
        var collabInProgress = false;
        function isFresh(tsact, tsview) {
            if(!tsact) {  //action never taken, so data not up to date
                return false; }
            if(!tsview) {  //data has not been observed, so compute not needed
                return true; }
            tsact = jt.isoString2Time(tsact).getTime();
            tsview = jt.isoString2Time(tsview).getTime();
            if(tsview - tsact < 24 * 60 * 60 * 1000) {
                return true; }  //data has been fetched within staleness range
            return false; }  //data needs to be refreshed
        function noteFan (mf, dispid) {
            mfps[mf.dsId] = mfps[mf.dsId] || {};
            mfps[mf.dsId].fan = mf;  //always update with latest given instance
            if(dispid) {  //note current status display div if given
                mfps[mf.dsId].dispid = dispid; } }
        function callHubFanCollab (mfanid, collabtype, ccontf, cerrf) {
            if(!app.util.haveHubCredentials()) {
                return cerrf(401, 
                    "Sign in to DiggerHub for music fan collaboration"); }
            mgrs.hcu.makeHubCall("fancollab", {
                verb:"POST",
                dat:app.util.authdata({mfid:mfanid, ctype:collabtype}),
                contf:function (hubres) {
                    const songs = hubres.slice(1);
                    mgrs.hcu.saveSongUpdatesFromHub("fsc.callHubFanCollab",
                                                    songs);
                    noteFan(hubres[0].musfs.find((mf) => mf.dsId === mfanid));
                    mgrs.aaa.updateCurrAcct(hubres[0], null,
                        function (acct) {
                            if(songs.length) {
                                app.deck.update("fancollab"); }
                            mgrs.fga.reflectUpdatedAccount(acct);
                            ccontf(); },
                        cerrf); },
                cerrf}); }
    return {
        doneNote: function (dispid, msg) {
            if(!msg) { return jt.out(dispid, ""); }
            jt.out(dispid, jt.tac2html(
                ["div", {cla:"donenotediv"},
                 [msg, " ",
                  ["a", {href:"#dismiss",
                         onclick:mdfs("fsc.doneNote", dispid)},
                   "Ok"]]])); },
        deleteFan: function (mfid) {
            const fan = mfps[mfid].fan;
            const digname = fan.digname;
            var confmsg = "Are you sure you want to delete " + digname + "?";
            if(fan.dfltrcv) {
                confmsg = "Clear " + fan.dfltrcv + " received default " +
                    "ratings and delete " + digname + "?"; }
            jt.out("fanactionsdiv", jt.tac2html(
                [confmsg,
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", id:"fandelnob",
                               onclick:mdfs("fsc.fanActionsDisplay")},
                    "No"],
                   ["button", {type:"button", id:"fandelyesb",
                               onclick:mdfs("fsc.clearAndRemove", mfid)},
                    "Yes"]]]])); },
        clearAndRemove: function (mfid) {
            const mp = mfps[mfid];
            if(mp.fan.dfltrcv) {  //still more default ratings to get rid of
                mp.statHTML = "Clearing " + mp.fan.dfltrcv +
                    " default ratings from " + mp.fan.digname + "...";
                jt.out(mp.dispid, mp.statHTML);
                callHubFanCollab(mfid, "clear",
                    function () {
                        mgrs.fsc.clearAndRemove(mfid); },
                    function (code, errtxt) {
                        mp.statHTML = "";
                        jt.out(mp.dispid, "Clearing default ratings failed " +
                               code + ": " + errtxt); }); }
            else { //default ratings cleared, remove fan from group
                const digname = mp.fan.digname;
                mp.statHTML = "Removing " + digname + " from group...";
                jt.out(mp.dispid, mp.statHTML);
                mp.statHTML = "";  //clear stat in case adding back later
                mgrs.fga.removeFanFromGroup(digname, mfps[mfid].dispid); } },
        getDefaultRatings: function (mfid, contf) {
            const mp = mfps[mfid];
            const digname = mp.fan.digname;
            const prevdrc = mp.fan.dfltrcv;
            mp.statHTML = "Getting default ratings from " + digname + "...";
            jt.out(mp.dispid, mp.statHTML);
            callHubFanCollab(mfid, "get",
                function () {
                    mgrs.fga.redisplay();  //show progress
                    if(mp.fan.dfltrcv !== prevdrc) {  //received new defaults
                        mgrs.fsc.doneNote(mp.dispid,
                                          "Checking more default ratings...");
                        mgrs.fsc.getDefaultRatings(mfid, contf); }  //check more
                    else {  //no more default ratings received
                        mgrs.fsc.doneNote(mp.dispid,
                                          "Default ratings fetched for " +
                                          digname);
                        if(mp.fan.common < mp.fan.dfltrcv) {
                            mgrs.fsc.recomputeFanCounts(mfid); }
                        if(contf) { contf(mfid); } } },
                function (code, errtxt) {
                    mp.statHTML = "";
                    jt.out(mp.dispid, "Getting default ratings failed " +
                           code + ": " + errtxt); }); },
        recomputeFanCounts: function (mfid, contf) {
            const mp = mfps[mfid];
            const digname = mp.fan.digname;
            mp.statHTML = "Counting common ratings with " + digname + "...";
            jt.out(mp.dispid, mp.statHTML);
            callHubFanCollab(mfid, "count",
                function () {
                    mgrs.fga.redisplay();
                    mgrs.fsc.doneNote(mp.dispid, "Common ratings with " +
                                      digname + " recounted.");
                    if(contf) { contf(mfid); } },
                function (code, errtxt) {
                    mp.statHTML = "";
                    jt.out(mp.dispid, "Common rating count failed " +
                           code + ": " + errtxt); }); },
        fanActionsDisplay: function (dispid, fan) {
            noteFan(fan, dispid);
            if(mfps[fan.dsId].status) {   //currently processing
                return jt.out(dispid, mfps[fan.dsId].statHTML); }
            jt.out(dispid, jt.tac2html(
                ["div", {id:"fanactionsdiv"}, fas.map((act) =>
                    ["button", {type:"button",
                                title:act.d.replace(/\$FAN/g, fan.digname),
                                onclick:mdfs("fsc." + act.a, fan.dsId)},
                     act.n])])); },
        noteMatchFormViewed: function () {  //match display viewed
            matchFormViewed = new Date().toISOString(); },
        updateContributions: function (acct) {  //recalc common and dflt rcv
            if(collabInProgress) {
                return; }  //finish processing outstanding hub call
            acct = acct || mgrs.aaa.getAccount();
            acct.musfs = acct.musfs || [];
            acct.musfs.forEach(function (mf) {
                noteFan(mf); });  //update mfps with latest fan info
            const comchkmf = acct.musfs.find((mf) =>
                !isFresh(mf.lastcommon, matchFormViewed));
            if(comchkmf) {  //need to recompute common ratings
                collabInProgress = true;
                mgrs.fsc.recomputeFanCounts(comchkmf.dsId, function () {
                    //change sort to common desc to indicate values have changed
                    if(mgrs.fga.formType() === "match") {
                        mgrs.fga.sort("common", "desc"); }
                    collabInProgress = false;
                    mgrs.fsc.updateContributions(); }); }
            else {  //all common calcs up to date
                const rcvchkmf = acct.musfs.find((mf) =>
                    !isFresh(mf.lastpull, matchFormViewed));
                if(rcvchkmf) {
                    collabInProgress = true;
                    mgrs.fsc.getDefaultRatings(rcvchkmf.dsId, function () {
                        collabInProgress = false;
                        mgrs.fsc.updateContributions(); }); } } }
    };  //end mgrs.fsc returned functions
    }());


    //Fan group actions manager handles connecting with other fans
    mgrs.fga = (function () {
        //messages and musfs can be sorted without persisting
        var fni = null;  //current display working info
        const srch = {id:"mfsrchin", value:""};
        const forms = {
            connect:{af:"musfs", flds:[
                {n:"digname", c:"fsc.fanActionsDisplay"},
                {n:"firstname", p:"name"},
                {n:"added", o:"desc", f:"ts"},
                {n:"lastheard", p:"last heard", o:"desc", f:"ts"}]},
            match:{af:"musfs", flds:[
                {n:"digname", c:"fsc.fanActionsDisplay"},
                {n:"common", o:"desc", p:"common", f:"int"},
                {n:"dfltrcv", o:"desc", p:"rcv", f:"int"},
                {n:"dfltsnd", o:"desc", p:"snd", f:"int"}]},
            messages:{af:"digmsgs", flds:[
                {n:"created", o:"desc", p:"when", f:"ts"},
                {n:"sendername", p:"who"},
                {n:"msgtype", p:"what", d:"fma.msgTxt", c:"fma.msgOpts"}]}};
        function sortCurrentObjects () {
            fni.objs.sort(function (a, b) {
                var res = 0; var sfi = 0; var sfd = null;
                while(!res && sfi < forms[fni.formtype].sofs.length) {
                    sfd = forms[fni.formtype].sofs[sfi];
                    if(sfd.f === "int") {
                        res = a[sfd.n] - b[sfd.n]; }
                    else {
                        res = a[sfd.n].localeCompare(b[sfd.n]); }
                    if(sfd.o === "desc") { res *= -1; }
                    sfi += 1; }
                return res; }); }
        function setCurrentFieldsAndInstances (form, curracct) {
            const fd = forms[form];  //form definition
            if(!fd.sofs) {  //init form sort order fields ref array
                fd.sofs = fd.flds.map((fld) => fld); }
            fni = {formtype:form, flds:forms[form].flds, acct:curracct,
                   objs:curracct[fd.af] || []};
            if(fd.af === "digmsgs") {
                fni.objs = mgrs.fma.messages()
                    .filter((m) => m.status === "open"); }
            else {  //skip any old/bad fan defs
                fni.objs = fni.objs.filter((mf) => !mf.email); }
            sortCurrentObjects(); }
        function headerFieldsHTML () {
            const downarrow = "&#x25BC;";
            const uparrow = "&#x25B2;";
            const html = jt.tac2html(["tr", fni.flds.map((fld) =>
                ["td", 
                 ["div", {cla:"fgasortcoldiv"},
                  ["div", {cla:(fld.f === "int" ? "fgacelldivnum"
                                                : "fgacelldiv")},
                   ["a", {href:"#sortby", onclick:mdfs("fga.sort", fld.n)},
                    (fld.o === "desc"? downarrow : uparrow) +
                    (fld.p || fld.n)]]]])]);
            return html; }
        function contentCellHTML (fld, obj, idx) {
            var val = obj[fld.n];
            var dispclass = "fgacelldiv";
            if(fld.f === "ts") {
                val = jt.colloquialDate(val, true, "z2loc nodaily").slice(4); }
            if(fld.f === "int") {  //display as string so zero values show up
                dispclass = "fgacelldivnum";
                val = String(val) + "&nbsp;"; }
            if(fld.d) {  //use display function for value
                val = dotDispatch(fld.d, val, fld, obj, idx); }
            if(fld.c) {  //clickable value 
                val = ["a", {href:"#" + fld.c,
                             onclick:mdfs("fga.togActionsDisplay", idx, fld.c)},
                       val]; }
            return ["div", {cla:dispclass}, val]; }
        function contentRowsHTML (extras) {
            var rows = [];
            if(extras.before) {
                rows.push(jt.tac2html(
                    ["tr", ["td", {colspan:fni.flds.length},
                            ["div", {id:"fgabeforehtmldiv"},
                             extras.before]]])); }
            if(extras.empty && !fni.objs.length) {
                rows.push(jt.tac2html(
                    ["tr", ["td", {colspan:fni.flds.length},
                            ["div", {id:"fgaemptyhtmldiv"},
                             extras.empty]]])); }
            rows = rows.concat(fni.objs.map((obj, idx) =>
                jt.tac2html(
                    [["tr", fni.flds.map((fld) =>
                        ["td", contentCellHTML(fld, obj, idx)])],
                     ["tr", ["td", {id:"detrowtd" + idx,
                                    colspan:fni.flds.length}]]])));
            if(extras.after) {
                rows.push(jt.tac2html(
                    ["tr", ["td", {colspan:fni.flds.length},
                            ["div", {id:"fgaafterhtmldiv"},
                             extras.after]]])); }
            return jt.tac2html(rows); }
        function formDisplayHTML (extras) {
            return jt.tac2html(
                [["div", {id:"fgadispdiv"},
                  ["table",
                   [headerFieldsHTML(),
                    contentRowsHTML(extras)]]],
                 ["div", {id:"fgaoverlaydiv",
                          onclick:mdfs("fga.displayOverlay")}]]); }
        function modifyFanGroup (fanact, fandig, ccontf, cerrf) {
            if(!app.util.haveHubCredentials()) {
                return cerrf(401, "Sign in to DiggerHub to change your fans"); }
            mgrs.hcu.makeHubCall("fangrpact", {
                verb:"POST",
                dat:app.util.authdata({action:fanact, digname:fandig}),
                contf:function (results) {
                    mgrs.aaa.updateCurrAcct(results[0], null,
                        function (acct) {
                            fni.acct = acct;
                            ccontf(acct); },
                        cerrf); },
                errf:cerrf}); }
        function noteUpdatedAccountAndRedisplay (acct, contrib) {
            mgrs.aaa.updateCurrAcct(acct, null,
                function () {
                    fni.acct = acct;
                    fni.objs = acct.musfs;
                    mgrs.fga[fni.formtype + "Form"](acct);  //update display
                    if(contrib) {
                        mgrs.fsc.updateContributions(acct); } },
                function (code, errtxt) {
                    jt.err("The hub account updated but app save failed " +
                           code + ": " + errtxt + 
                           ". You should probably reload the app."); }); }
        function recsButtonTAC (acct) {
            var tac = "";
            if(acct && acct.musfs && acct.musfs.length) {
                tac = ["button", {type:"button", id:"getrecsb",
                                  onclick:mdfs("fma.getRecs", "msgstatdiv")},
                       "Get Recommendations"]; }
            return tac; }
    return {
        reflectUpdatedAccount: function (acct) {
            if(fni) {  //form currently displayed and processing
                fni.acct = acct;
                if(fni.formtype !== "messages") {
                    fni.objs = acct.musfs;
                    sortCurrentObjects(); } } },
        redisplay: function () {
            if(fni) {  //form currently displayed
                mgrs.fga[fni.formtype + "Form"](fni.acct); } },
        sort: function (fieldname, direction) {
            var sofs = forms[fni.formtype].sofs;
            if(sofs[0].n === fieldname) {  //already first
                if(direction) {
                    sofs[0].o = direction; }
                else {  //change direction
                    if(sofs[0].o === "desc") {
                        sofs[0].o = "asc"; }
                    else {
                        sofs[0].o = "desc"; } } }
            else {  //move field to first position in search ordering
                const sf = sofs.find((sf) => sf.n === fieldname);
                sofs = sofs.filter((sf) => sf.n !== fieldname);
                sofs.unshift(sf);
                forms[fni.formtype].sofs = sofs; }
            //sortCurrentObjects();  called in redisplay processing
            mgrs.fga.redisplay(); },
        search: function (srchid) {
            var val = jt.byId(srchid).value;
            if(srch.status === "searching") { return; }  //ignore extra click
            if(!val) {
                return jt.out("mfsrchstatdiv",
                              "Need fan's digname for search"); }
            srch.status = "searching";
            jt.out("mfsrchstatdiv", "Searching...");
            modifyFanGroup("add", val,
                function (acct) {
                    srch.status = "";
                    noteUpdatedAccountAndRedisplay(acct, "contrib"); },
                function (code, errtxt) {
                    srch.status = "";
                    jt.out("mfsrchstatdiv", code + ": " + errtxt); }); },
        connectme: function () {
            jt.out("mfsrchstatdiv", "Connecting you...");
            modifyFanGroup("add", "",
                function (acct) {  //acct has new musfs with all counts zero
                    fni.formtype = "match";  //display collab process
                    noteUpdatedAccountAndRedisplay(acct, "contrib"); },
                function (code, errtxt) {
                    jt.out("mfsrchstatdiv", code + ": " + errtxt); }); },
        removeFanFromGroup: function (digname, dispid) {
            modifyFanGroup("remove", digname,
                function (acct) {
                    noteUpdatedAccountAndRedisplay(acct); },
                function (code, errtxt) {
                    jt.out(dispid || "mfsrchstatdiv", "Remove failed " +
                           code + ": " + errtxt); }); },
        togActionsDisplay: function (idx, fscfn) {
            var dtd = jt.byId("detrowtd" + idx);
            if(dtd.innerHTML) {  //currently displayed, toggle off
                dtd.innerHTML = "";
                return; }
            dotDispatch(fscfn, "detrowtd" + idx, fni.objs[idx]); },
        displayOverlay: function () {
            const ovd = jt.byId("fgaoverlaydiv");
            if(!ovd) { return; }
            const dd = jt.byId("fgadispdiv");
            const hsBacklogCount = mgrs.srs.hubsyncBacklogCount();
            if(hsBacklogCount) {
                dd.style.opacity = 0.3;
                ovd.innerHTML = "Waiting for hubsync to finish uploading " +
                    hsBacklogCount + " songs before collaborating...";
                ovd.style.height = dd.offsetHeight + "px";
                mgrs.srs.syncToHub("unposted");  //verify sync scheduled
                setTimeout(mgrs.fga.displayOverlay, 5000);
                return true; }
            dd.style.opacity = 1.0;
            ovd.innerHTML = "";
            ovd.style.height = "0px";
            return false; },
        connectForm: function (acct) {
            setCurrentFieldsAndInstances("connect", acct);
            jt.out("afgcontdiv", formDisplayHTML({
                after:jt.tac2html(
                    ["div", {id:"mfsrchdiv"},
                     [["Find music fan &nbsp;",
                       ["input", {type:"text", id:srch.id, size:14,
                                  placeholder:"digname...",
                                  value:srch.value,
                                  onchange:mdfs("fga.search", srch.id)}],
                       ["a", {href:"#search", title:"Search Fans",
                              onclick:mdfs("fga.search", srch.id)},
                        ["img", {src:"img/search.png", cla:"ico20"}]]],
                      ["div", {id:"mfsrchstatdiv"}]]]),
                empty:jt.tac2html(
                    ["button", {type:"button", id:"connectmeb",
                                onclick:mdfs("fga.connectme", "connectmeb")},
                     "Connect Me"])}));
            mgrs.fga.displayOverlay(); },
        matchForm: function (acct) {
            mgrs.fsc.noteMatchFormViewed();
            setCurrentFieldsAndInstances("match", acct);
            jt.out("afgcontdiv", formDisplayHTML({
                empty:"No music fans in your group"}));
            if(!mgrs.fga.displayOverlay()) {
                mgrs.fsc.updateContributions(acct); } },
        messagesForm: function (acct) {
            setCurrentFieldsAndInstances("messages", acct);
            jt.out("afgcontdiv", formDisplayHTML({
                empty:"No messages",
                after:jt.tac2html(
                    ["div", {id:"msgstatdiv"}, recsButtonTAC(acct)])}));
            mgrs.fma.fetchMessagesIfStale(
                function () { mgrs.fga.messagesForm(acct); },
                function (code, errtxt) {
                    jt.out("msgstatdiv", "Message fetch failed " + code + ": " +
                           errtxt + ". Try again in a few minutes"); });
            mgrs.fga.displayOverlay(); },
        formType: function () {
            if(!fni) {
                return ""; }
            return fni.formtype || ""; }
    };  //end mgrs.fga returned functions
    }());


    //Account sign in and update manager handles the standard account forms.
    //Notes:
    //  - Forgot password sends an email with a link back to diggerhub.
    //    They change their password on the hub and then sign in with the app.
    //  - Changing an email address for an account requires prompting for a
    //    password to create a new phash for an access token.
    mgrs.asu = (function () {
        var curracct = null;  //temp local copy refreshed on each form display
        var emsent = "";
        const affs = [  //modes: 'j'oin|'s'ignin|'p'rofile|pass'w'ordchg
            {n:"email", dn:"email", m:"pwd", ty:"readonly"},
            {n:"email", dn:"email", m:"js", ty:"email"},
            {n:"password", dn:"password", m:"js", ty:"password"},
            {n:"updemail", dn:"new email", m:"w", ty:"email"},
            {n:"updpassword", dn:"new password", m:"w", ty:"password"},
            {n:"firstname", dn:"first name", m:"jp", ty:"text"},
            {n:"digname", dn:"dig name", m:"jp", ty:"text", plc:"unique"},
            {n:"privaccept", m:"jp", ty:"checkbox"}];
        function makeLabel (labname) {
            switch(labname) {
            case "privaccept":
                return app.docs.subPlaceholders(
                    app.overlaydiv, app.svc.plat("urlOpenSupp"),
                    "I'm ok with the PRIVPOLICY");
            default: return "Unknown label type: " + labname; } }
        function makeInput (acct, aff) {
            var val = "";
            if(acct && acct[aff.n]) { val = acct[aff.n]; }
            if(jt.byId(aff.n + "in")) { val = jt.byId(aff.n + "in").value; }
            return ["input", {type:(aff.ty || "text"), id:aff.n + "in",
                              value:val, placeholder:(aff.plc || "")}]; }
        function formTableRow (acct, aff) {
            switch(aff.ty) {
            case "checkbox": return jt.tac2html(
                ["tr",
                 ["td", {colspan:2},
                  [["input", {type:"checkbox", id:aff.n + "in",
                              value:new Date().toISOString()}],
                   ["label", {fo:aff.n + "in", id:aff.n + "label"},
                    makeLabel(aff.n)]]]]);
            case "readonly": return jt.tac2html(
                ["tr",
                 [["td", {cla:"formattr"}, (aff.dn || aff.n)],
                  ["td", ["span", {cla:"formvalspan"}, acct[aff.n]]]]]);
            default: return jt.tac2html(
                ["tr",
                 [["td", {cla:"formattr"}, (aff.dn || aff.n)],
                  ["td", makeInput(acct, aff)]]]); } }
        function contextuallyObviated (aff) {
            return (aff.n === "privaccept" && mgrs.ppc.policyAccepted()); }
        function clientCancelButton () {
            var ret = "";
            if(inapp) {
                ret = ["button", {type:"button", id:"cancelb",
                                  onclick:mdfs("gen.togtopdlg", null, "close")},
                       "Cancel"]; }
            return ret; }
        function accountFieldsForm (acct, mode, buttons, extra) {
            curracct = acct;  //update form processing account context
            extra = extra || "";
            jt.out("afgcontdiv", jt.tac2html(
                [["table",
                  affs.filter((aff) => (aff.m.includes(mode) &&
                                        !contextuallyObviated(aff)))
                  .map((aff) => formTableRow(acct, aff))],
                 ["div", {id:"afgstatdiv"}],
                 ["div", {cla:"dlgbuttonsdiv", id:"afgbtsdiv"}, buttons],
                 ["div", {id:"afgextradiv"}, extra]])); }
        function formData (mode, dat) {
            dat = dat || {};
            affs.filter((aff) => (aff.m.includes(mode) &&
                                  !contextuallyObviated(aff)))
                .forEach(function (aff) {
                    var input = jt.byId(aff.n + "in");
                    if(input) {
                        if(aff.ty === "checkbox") {
                            dat[aff.n] = (input.checked? input.value : ""); }
                        else {
                            dat[aff.n] = input.value.trim(); } } });
            return dat; }
        function addAuthDataFields (dat) {
            if(curracct) {
                dat.an = curracct.email;
                dat.at = curracct.token; } }
        function formError (dat, ecfs) {
            ecfs = ecfs || [];
            const ef = ecfs.find((ecf) => ecf(dat));
            if(ef) {
                const err = ef(dat);
                jt.out("afgstatdiv", err.msg);
                if(err.fld) {
                    const input = jt.byId(err.fld + "in");
                    if(input) {
                        input.focus(); } } }
            return ef; }
        function verifyEmail (dat) {
            if(!jt.isProbablyEmail(dat.email)) {
                return {msg:"Need email address.", fld:"email"}; } }
        function verifyPwd (dat) {
            if(!dat.password) {  //let server enforce length and other reqs
                return {msg:"Need password.", fld:"password"}; } }
        function verifyPriv (dat) {
            if(!dat.privaccept && !contextuallyObviated({n:"privaccept"})) {
                return {msg:"Is the privacy policy acceptable?"}; } }
        function verifyFirst (dat) {
            const fnml = 32;
            if(!dat.firstname) {
                return {msg:"Need a name to call you by.", fld:"firstname"}; }
            if(dat.firstname.length > fnml) {
                return {msg:"Max " + fnml + " letters.", fld:"firstname"}; } }
        function verifyDN (dat) {
            const dnml = 20;
            if(!dat.digname) {
                return {msg:"Need a unique Digger name.", fld:"digname"}; }
            if(dat.digname.length > dnml) {
                return {msg:"Max " + dnml + " letters.", fld:"digname"}; } }
        function verifyCred (dat) {
            if(!jt.isProbablyEmail(dat.updemail)) {
                return {msg:"Need email address.", fld:"updemail"}; }
            if(!dat.updpassword) {  //let server enforce length and other reqs
                return {msg:"Need password.", fld:"updpassword"}; } }
        function verifyKwdefs (dat) {
            if(!dat.kwdefs || dat.kwdefs === "{}") {
                dat.kwdefs = JSON.stringify(
                    mgrs.aaa.getDefaultKeywordDefinitions()); } }
        function hubThenLocal (buttonid, pverb, endpoint, pdat, pcontf) {
            jt.byId(buttonid).disabled = true;
            jt.out("afgstatdiv", "Calling DiggerHub...");
            jt.log("hubThenLocal " + pverb + " " + endpoint);
            const gef = function (code, errtxt) {  //general errf
                jt.byId(buttonid).disabled = false;
                jt.log("hubThenLocal.gef " + code + " " + errtxt);
                jt.out("afgstatdiv", code + ": " + errtxt); };
            const hcf = function (atk) {  //post hub call contf
                if(endpoint.startsWith("mailpwr")) {
                    jt.out("afgstatdiv", "Sent.");
                    return pcontf(); }  //no account to update
                jt.out("afgstatdiv", "Saving...");
                if(endpoint === "acctok") { //reset syncsince on new signin
                    atk[0].syncsince = atk[0].created + ";1"; }
                mgrs.aaa.updateCurrAcct(
                    atk[0], atk[1],
                    function (acct) {
                        jt.out("afgstatdiv", "Saved.");
                        if(app.svc.plat("hdm") === "loc") {
                            mgrs.srs.syncToHub(endpoint); }  //verify data sync
                        pcontf(acct); },
                    gef); };
            mgrs.hcu.makeHubCall(endpoint, {verb:pverb, dat:jt.objdata(pdat),
                                            contf:hcf, errf:gef}); }
    return {
        newacctForm: function (acct) {
            accountFieldsForm(acct, "j",
                [clientCancelButton(),
                 ["button", {type:"button", id:"newacctb",
                            onclick:mdfs("asu.newacctProc", "newacctb")},
                 "Create Account"]]); },
        newacctProc: function (buttonid) {
            const dat = formData("j");
            if(!formError(dat, [verifyEmail, verifyPwd, verifyFirst, verifyDN,
                                verifyPriv, verifyKwdefs])) {
                hubThenLocal(buttonid, "POST", "newacct", dat, function (acct) {
                    if(inapp) {
                        mgrs.gen.updateHubToggleSpan(acct);
                        mgrs.gen.togtopdlg(null, "close"); }
                    else {  //standalone account management
                        mgrs.afg.accountFanGroup("personal"); } }); } },
        signinForm: function (acct) {
            accountFieldsForm(acct, "s",
                [clientCancelButton(),
                 ["button", {type:"button", id:"signinb",
                             onclick:mdfs("asu.signinProc", "signinb")},
                  "Sign In"]],
                ["a", {href:"#pwdreset", title:"Send password reset email",
                       onclick:mdfs("asu.emailPwdReset")},
                 "Send password reset"]);
            if(!inapp) {  //allow enter key signin on website
                jt.on("passwordin", "change", function (evt) {
                    mgrs.asu.signinProc("signinb");
                    jt.evtend(evt); }); } },
        signinProc: function (buttonid) {
            const dat = formData("s");
            if(!formError(dat, [verifyEmail, verifyPwd])) {
                mgrs.srs.noteDataRestorationNeeded();
                hubThenLocal(buttonid, "POST", "acctok", dat, function (acct) {
                    if(inapp) {  //running within web app
                        mgrs.gen.updateHubToggleSpan(acct);  //UI reflect name
                        mgrs.gen.togtopdlg(null, "close");
                        mgrs.igf.resetIgnoreFolders(acct.igfolds);
                        mgrs.igf.markIgnoreSongs();
                        mgrs.aaa.notifyAccountChanged();  //UI reflect settings
                        //acct.syncsince already reset in hubThenLocal
                        mgrs.srs.restoreFromBackup("signin"); }
                    else { //standalone account management
                        app.login.dispatch("ap", "save", acct);
                        mgrs.afg.accountFanGroup("groups", 2); } }); } },
        emailPwdReset: function () {
            const dat = formData("s");
            if(!formError(dat, [verifyEmail])) {
                const url = app.util.cb("mailpwr", dat);
                hubThenLocal("signinb", "GET", url, null, function () {
                    var msg = "Email sent.";
                    if(emsent) { msg += " Check spam folder."; }
                    emsent = new Date().toISOString();
                    jt.out("afgstatdiv", msg); }); } },
        settingsForm: function (statmsg) {
            const acct = mgrs.aaa.getAccount();
            const stgs = acct.settings || {};
            const sact = stgs.sumact || {sendon:"Wednesday"};
            const dsow = ["Monday", "Tuesday", "Wednesday", "Thursday",
                          "Friday", "Saturday", "Sunday"];
            jt.out("afgcontdiv", jt.tac2html(
                [["div", {cla:"settingsrowdiv"},
                  [["input", {type:"checkbox", id:"wkactin", value:"active",
                              checked:jt.toru(sact.sendon !== "Never")}],
                   ["label", {fo:"wkactin"}, "Weekly report"],
                   ["select", {id:"wkactdaysel", title:"Weekly report day"},
                    dsow.map((d) =>
                        ["option", {value:d,
                                    selected:jt.toru(d === sact.sendon)},
                         d])]]],
                 ["div", {id:"afgstatdiv"}, statmsg || ""],
                 ["div", {cla:"dlgbuttonsdiv", id:"afgbtsdiv"},
                  [["button", {type:"button", id:"cancelb",
                               onclick:mdfs("asu.profileForm")},
                    "Cancel"],
                   ["button", {type:"button", id:"saveb",
                               onclick:mdfs("asu.settingsProc")},
                    "Save"]]]]));
            if(statmsg) {
                jt.out("afgbtsdiv", jt.tac2html(
                    ["button", {type:"button", id:"cancelb",
                                onclick:mdfs("asu.profileForm")},
                     "Done"])); } },
        settingsProc: function () {
            var dow = "Wednesday";
            const cb = jt.byId("wkactin");
            if(cb && !cb.checked) {
                dow = "Never"; }
            else {  //use selected day
                const sel = jt.byId("wkactdaysel");
                dow = sel.value; }
            const acct = mgrs.aaa.getAccount();
            acct.settings.sumact = acct.settings.sumact || {};
            acct.settings.sumact.sendon = dow;
            jt.out("afgstatdiv", "Saving...");
            jt.byId("afgbtsdiv").style.display = "none";
            mgrs.aaa.updateCurrAcct(
                acct, acct.token,
                function () {
                    mgrs.asu.settingsForm("Saved."); },
                function (code, errtxt) {
                    jt.out("afgstatdiv", "Save failed " + code + ": " + errtxt);
                    jt.byId("afgbtsdiv").style.display = "block"; }); },
        profileForm: function (acct) {
            acct = acct || mgrs.aaa.getAccount();
            accountFieldsForm(
                acct, "p",
                [["div", {id:"formfunctogdiv"},
                  ["a", {href:"#settings",
                         onclick:mdfs("asu.settingsForm")},
                   "Settings"]],
                 ["button", {type:"button", id:"updateb",
                             onclick:mdfs("asu.profileProc", "updateb")},
                  "Update"]]); },
        profileProc: function (buttonid) {
            const dat = formData("p");
            addAuthDataFields(dat);
            if(app.startParams.actcode) {
                dat.actcode = app.startParams.actcode; }
            if(!formError(dat, [verifyFirst, verifyDN, verifyPriv])) {
                hubThenLocal(buttonid, "POST", "updacc", dat, function (acct) {
                    if(inapp && dat.privaccept) {  //checkbox done
                        mgrs.gen.togtopdlg(null, "close"); }
                    mgrs.gen.updateHubToggleSpan(acct);  //UI reflect name
                    jt.out("afgbtsdiv", "");
                    jt.out("afgstatdiv", "Profile updated."); }); } },
        credentialsForm: function (acct) {
            accountFieldsForm(acct, "w",
                ["button", {type:"button", id:"updcredb",
                            onclick:mdfs("asu.credentialsProc", "updcredb")},
                 "Update"]);
            jt.byId("updemailin").value = acct.email; },
        credentialsProc: function (buttonid) {
            const dat = formData("w");
            addAuthDataFields(dat);  //auth when resetting password
            if(!formError(dat, [verifyCred])) {
                hubThenLocal(buttonid, "POST", "updacc", dat, function () {
                    jt.out("afgbtsdiv", "");
                    jt.out("afgstatdiv", "Credentials updated."); }); } },
        signoutForm: function (acct) {
            acct = acct || mgrs.aaa.getAccount();
            accountFieldsForm(
                acct, "d",
                [["button", {type:"button", id:"deletemeb",
                             onclick:mdfs("asu.confirmDeleteMe")},
                  "Delete Me"],
                 ["button", {type:"button", id:"signoutb",
                             onclick:mdfs("asu.confirmSignOut")},
                  "Sign Out"]],
                ["div", {id:"dmsoConfirmDiv"}]); },
        confirmDeleteMe: function () {
            jt.out("dmsoConfirmDiv", jt.tac2html(
                [["Are you sure you want to irrevocably and completely delete your account, song ratings, and all information you have saved on DiggerHub?"],
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", id:"dmconfnob",
                               onclick:mdfs("asu.signoutForm")}, "No"],
                   ["button", {type:"button", id:"dmconfyesb",
                               onclick:mdfs("asu.processDeleteMe")},
                    "Yes"]]]])); },
        processDeleteMe: function () {
            var acct = mgrs.aaa.getAccount();
            jt.out("dmsoConfirmDiv", "Sending deletion confirmation...");
            mgrs.hcu.makeHubCall("deleteme", {
                verb:"POST", dat:jt.objdata(
                    {an:acct.email, at:acct.token,
                     tzoff:new Date().getTimezoneOffset()}),
                contf:function () {
                    jt.out("dmsoConfirmDiv", "Account deletion confirmation instructions have been sent to " + acct.email + ". Follow the instructions in the email verifying you are the account owner."); },
                errf:function (code, errtxt) {
                    jt.out("Deletion failed, please contact support, " + code +
                           ": " + errtxt); }}); },
        confirmSignOut: function () {
            jt.out("dmsoConfirmDiv", jt.tac2html(
                [["You will need to resync all your songs when you sign in again. Continue signing out?"],
                 ["div", {cla:"dlgbuttonsdiv"},
                  [["button", {type:"button", id:"soconfnob",
                               onclick:mdfs("asu.signoutForm")}, "No"],
                   ["button", {type:"button", id:"soconfyesb",
                               onclick:mdfs("asu.processSignOut")},
                    "Yes"]]]])); },
        processSignOut: function () {
            if(app.svc.plat("hdm") === "loc") {
                mgrs.srs.syncToHub("cancel"); }
            else { //"web"
                app.login.dispatch("hua", "signOut"); }
            mgrs.aaa.removeAccount(mgrs.aaa.getAccount(),
                function () {
                    if(inapp) {
                        mgrs.gen.updateHubToggleSpan(mgrs.aaa.getAccount());
                        mgrs.aaa.notifyAccountChanged(); }
                    mgrs.afg.accountFanGroup("offline"); },
                function (code, errtxt) {
                    jt.out("afgstatdiv", code + ": " + errtxt); }); }
    };  //end mgrs.asu returned functions
    }());


    //Account and fan group manager handles personal and connection forms.
    mgrs.afg = (function () {
        var psicbf = null;
        var mode = "offline";
        const tabs = {
            offline: [
                {h:"join", t:"join", oc:"asu.newacctForm"},
                {h:"signin", t:"sign in", oc:"asu.signinForm"}],
            personal: [
                {h:"profile", t:"profile", oc:"asu.profileForm"},
                {h:"password", t:"password", oc:"asu.credentialsForm"},
                {h:"signout", t:"sign out", oc:"asu.signoutForm"},
                {h:"fans", t:"fans", oc:"afg.groups"}],
            groups: [
                {h:"connect", t:"connect", oc:"fga.connectForm"},
                {h:"match", t:"match", oc:"fga.matchForm"},
                {h:"messages", t:"messages", oc:"fga.messagesForm"},
                {h:"me", t:"me", oc:"afg.personal"}]};
        function haveProfileIssue (acct) {
            return (acct && !acct.digname); }
        function getProfileAccount () {
            var acct = mgrs.aaa.getAccount();
            if(acct && acct.dsId === "101") {
                acct = null; }
            if(acct && !inapp) {
                //no confirmation of signout when on web.
                tabs.personal[2].oc = "asu.processSignOut"; }
            return acct; }
        function verifyModeAndIndex (acct, dispmode, midx) {
            midx = midx || 0;
            if(dispmode) {
                mode = dispmode; }
            else { //use default display
                if(!acct) {
                    mode = "offline"; }
                else {
                    mode = "groups";
                    const msgs = mgrs.fma.messages();
                    if(msgs && msgs.length) {
                        midx = 2; } } }
            if(haveProfileIssue(acct)) {
                mode = "personal";
                midx = 0; }
            return midx; }
    return {
        runOutsideApp: function (divid, postSignInCallbackFunc) {
            inapp = false;
            tddi = divid;
            psicbf = postSignInCallbackFunc || null; },
        accountFanGroup: function (dispmode, midx) {
            const acct = getProfileAccount();
            midx = verifyModeAndIndex(acct, dispmode, midx);
            if(!jt.byId("afgcontdiv") || mode !== "offline") {  //keep emailin
                jt.out(tddi, jt.tac2html(
                    ["div", {id:"afgdiv"},
                     [["div", {id:"afgtopdiv"}],
                      ["div", {id:"afgcontdiv"}]]])); }
            jt.out("afgtopdiv", jt.tac2html(
                tabs[mode].map((tab, ti) => jt.tac2html(
                    ["a", {href:"#" + tab.h,
                           onclick:mdfs("afg.accountFanGroup", mode, ti)},
                     ["span", {cla:((midx === ti)? "fhselspan" : "fhspan")},
                      tab.t]]))
                    .join(" &nbsp;|&nbsp ")));
            const [mgr, fun] = tabs[mode][midx].oc.split(".");
            if(haveProfileIssue(acct)) {
                mgrs.asu.profileForm(acct); }
            else if(acct && psicbf) {  //return valid account to caller
                psicbf(acct); }
            else if(mgr === "afg") {
                mgrs.afg.accountFanGroup(fun); }
            else {
                mgrs[mgr][fun](acct); } }
    };  //end mgrs.afg returned functions
    }());


    //App account access manager serves as central ref for account and config
    //Update DigAcc on hub first, then reflect in local/runtime config.
    mgrs.aaa = (function () {
        const dfltkeywords = {
            Social: {pos: 1, sc: 0, ig: 0, dsc: "Music I might select to play when other people are listening."},
            Personal: {pos: 2, sc: 0, ig: 0, dsc: "Music I might select to play when it's just me listening."},
            Office: {pos: 3, sc: 0, ig: 0, dsc: "Music that you can listen to while you work."},
            Dance: {pos: 4, sc: 0, ig: 0, dsc: "Music you would dance to."},
            Ambient: {pos: 0, sc: 0, ig: 0, dsc: "Music that can be listened to from zero to full attention, transitioning from and to silence."},
            Jazz: {pos: 0, sc: 0, ig: 0, dsc: "However you define it for your collection."},
            Classical: {pos: 0, sc: 0, ig: 0, dsc: "However you define it for your collection."},
            Talk: {pos: 0, sc: 0, ig: 0, dsc: "Spoken word."},
            Solstice: {pos: 0, sc: 0, ig: 0, dsc: "Holiday seasonal."}};
        function logAccountInfo (src, acct) {
            jt.log(src + " " + acct.firstname + " " + acct.dsId + " " +
                   (acct.digname || "-") + " modified: " + acct.modified + 
                   ", syncsince: " + (acct.syncsince || "-")); }
        function verifyConfig (cfg) {
            var upds = [];
            if(!cfg.acctsinfo || !Array.isArray(cfg.acctsinfo.accts)) {
                upds.push("initialized cfg.acctsinfo");
                cfg.acctsinfo = {currid:"", accts:[]}; }
            if(!cfg.acctsinfo.accts.find((x) => x.dsId === "101")) {
                upds.push("created default account");
                const diggerbday = "2019-10-11T00:00:00Z";
                cfg.acctsinfo.accts.push(
                    {dsType:"DigAcc", dsId:"101", firstname:"Digger",
                     created:diggerbday, modified:diggerbday + ";1",
                     email:(app.supnm + "@" + app.domain), token:"none",
                     kwdefs:dfltkeywords, igfolds:(cfg.dfltigfolds || [])}); }
            if(!cfg.acctsinfo.currid) {
                upds.push("defaulted cfg.acctsinfo.currid");
                cfg.acctsinfo.currid = "101"; }
            //verify current account fields deserialized
            const acct = mgrs.aaa.getAccount();
            mgrs.hcu.deserializeAccount(acct);
            logAccountInfo("aaa.verifyConfig", acct);
            if(upds.length) {
                jt.log("aaa.verifyConfig updates: " + upds.join(", "));
                setTimeout(function () {
                    jt.log("aaa.verifyConfig saving updated config");
                    app.pdat.writeConfig("aaa.verifyConfig"); }, 50); } }
        function setAccountTokenIfGiven (acct, token) {
            const prevacc = app.pdat.configObj().acctsinfo.accts.find((a) =>
                a.dsId === acct.dsId);
            if(prevacc) {
                token = token || prevacc.token; }
            acct.token = token; }
        function replaceOrAddAccount (acct, remove) {
            const cfg = app.pdat.configObj();
            cfg.acctsinfo.accts = cfg.acctsinfo.accts.filter(
                (a) => a.dsId !== acct.dsId);
            if(remove) {
                cfg.acctsinfo.currid = "101"; }
            else {
                cfg.acctsinfo.currid = acct.dsId;
                cfg.acctsinfo.accts.unshift(acct); } }
    return {
        initialize: function () {
            app.pdat.addApresDataNotificationTask("checkDarkMode", function () {
                mgrs.aaa.reflectDarkMode(mgrs.aaa.getDarkMode()); });
            app.pdat.addConfigListener("top.aaa", verifyConfig); },
        getDefaultAccount: function () {
            return app.pdat.configObj().acctsinfo.accts.find((acc) =>
                acc.dsId === "101"); },
        getDefaultKeywordDefinitions: function () { return dfltkeywords; },
        getAccount: function () {
            const cfg = app.pdat.configObj();
            if(!cfg) { return null; }  //hub may request without pdat
            return cfg.acctsinfo.accts.find((acc) =>
                acc.dsId === cfg.acctsinfo.currid); },
        setCurrentAccount: function (acct, token) {
            setAccountTokenIfGiven(acct, token);
            replaceOrAddAccount(acct);
            logAccountInfo("aaa.setCurrentAccount", acct);
            app.pdat.writeConfig("aaa.setCurrentAccount"); },
        updateCurrAcct: function (acct, token, contf, errf) {
            mgrs.hcu.deserializeAccount(acct);  //verify fields deserialized
            setAccountTokenIfGiven(acct, token);
            replaceOrAddAccount(acct);
            app.pdat.writeConfig("top.aaa.updateCurrAcct", null,
                function () {
                    mgrs.hcu.verifyClientVersion();
                    contf(mgrs.aaa.getAccount()); },
                errf); },
        removeAccount: function (acct, contf, errf) {
            replaceOrAddAccount(acct, "remove");
            app.pdat.writeConfig("top.aaa.removeAccount", null,
                function () {
                    contf(mgrs.aaa.getAccount()); },
                errf); },
        notifyAccountChanged: function (context) {
            //factored method for those acct changes that require UI updates
            if(!context || context === "keywords") {
                mgrs.kwd.rebuildKeywords();
                app.player.dispatch("kwd", "rebuildToggles");
                app.filter.dispatch("kft", "rebuildControls"); }
            if(!context || context === "igfolders") {
                mgrs.igf.redrawIgnoreFolders(); } },
        getDarkMode: function () {  //returns either "dark" or "light"
            const cfg = app.pdat.configObj();
            if(!cfg || !cfg.darkmode) { return "light"; }
            return cfg.darkmode; },
        getDarkModeButtonDisplayName: function () {
            const mode = mgrs.aaa.getDarkMode();
            if(mode === "dark") { return "Light"; }
            return "Dark"; },
        reflectDarkMode: function (mode) {
            mode = mode || mgrs.aaa.getDarkMode();
            const dmcss = jt.byId("darkmodecss");
            if(dmcss) {
                if(mode === "dark") {
                    dmcss.disabled = false; }
                else {
                    dmcss.disabled = true; } }
            const button = jt.byId("darkmodebutton");
            if(button) {
                button.innerHTML =
                    mgrs.aaa.getDarkModeButtonDisplayName(); } },
        toggleDarkMode: function (mode) {
            if(!mode) {
                mode = mgrs.aaa.getDarkMode();
                if(mode === "light") {
                    mode = "dark"; }
                else {
                    mode = "light"; } }
            app.pdat.configObj().darkmode = mode;
            app.pdat.writeConfig("top.aaa.toggleDarkMode", null,
                function (cfg) {
                    mgrs.aaa.reflectDarkMode(cfg.darkmode); },
                function (code, errtxt) {
                    jt.log("toggleDarkMode writeConfig call failure " + code +
                           ": " + errtxt); }); },
        getCollectionStyle: function () {
            var dbpt = app.pdat.configObj().dbPersistence;
            if(!dbpt) {
                if(app.svc.plat("defaultCollectionStyle")) {
                    dbpt = app.svc.plat("defaultCollectionStyle"); }
                else {  //mobile platforms are assumed to be localCopy
                    dbpt = "localCopy"; } }
            return dbpt; },
        setCollectionStyle: function (dbpt) {
            app.pdat.configObj().dbPersistence = dbpt;
            app.pdat.writeConfig("top.aaa.setCollectionStyle", null,
                function () {
                    mgrs.lcm.displayLocalCarryInfo(); },
                function (code, errtxt) {
                    jt.log("setCollectionStyle config write failure " + code +
                           ": " + errtxt); }); }
    };  //end mgrs.aaa returned functions
    }());


    //Privacy policy change manager handles checking things are up to date
    mgrs.ppc = (function () {
        var callsToCheck = 0;
        var pts = "";  //policy timestamp
    return {
        policyAccepted: function () {
            const acct = mgrs.aaa.getAccount();
            if(acct) {
                if(acct.hubdat) {
                    if(acct.hubdat.privaccept > pts) {
                        return true; }
                    jt.log("top.ppc.policyAccepted " +
                           acct.hubdat.privaccept + " <= " + pts); }
                else {
                    jt.log("top.ppc.policyAccepted no acct.hubdat"); } }
            return false; },
        checkPrivacyPolicyTimestamp: function () {
            jt.log("checkPrivacyPolicyTimestamp callsToCheck " + callsToCheck);
            const acct = mgrs.aaa.getAccount();
            if(!acct || acct.dsId === "101" || pts) {
                return; }  //not signed in, or already checked
            callsToCheck += 1;
            app.svc.docContent("docs/privacy.html", function (body) {
                var idx = body.indexOf("span id=\"privlut\"");
                if(idx < 0) {
                    return jt.log("no timestamp marker in privacy.html"); }
                body = body.slice(idx);
                body = body.slice(body.indexOf(">") + 1);
                pts = body.slice(0, body.indexOf("<"));
                if(!mgrs.ppc.policyAccepted()) {
                    jt.err("The DiggerHub privacy policy has been updated.");
                    //open the profile tab with the priv policy checkbox
                    mgrs.afg.accountFanGroup("personal", 0); } }); }
    };  //end mgrs.ppc returned functions
    }());


    ////////////////////////////////////////////////////////////
    // Library actions
    ////////////////////////////////////////////////////////////

    //Config manager handles path changes requiring an app restart.
    mgrs.cfg = (function () {
        var cdat = null;
    return {
        restart: function () {
            cdat = null;
            app.boot.initAppModules(); },  //restart
        updateConfig: function () {
            const cfo = app.pdat.configObj();
            cfo.musicPath = jt.byId("mlibin").value;
            cfo.dbPath = jt.byId("dbfin").value;
            //delete the existing config file and write the new one
            const ecso = app.svc.extensionInterface("edconf");
            ecso.changeConfig(cfo,
                function () { mgrs.cfg.restart(); },
                function (code, errtxt) {
                    jt.out("configstatdiv", "Config update failed " +
                           code + ": " + errtxt); }); },
        launch: function () {
            const cfo = app.pdat.configObj();
            cdat = {musicPath:cfo.musicPath, dbPath:cfo.dbPath};
            jt.out("contentdiv", jt.tac2html(
                ["div", {cla:"paneldiv"},
                 [["div", {id:"titlediv"},
                   ["span", {cla:"titlespan"}, "Digger Config"]],
                  ["div", {id:"ciheadingdiv"},
                   ["Changes will be saved to ",
                    ["span", {cla:"filenamespan"}, ".digger_config.json"],
                    " in your home folder."]],
                  //Local file names are not accessible via JS.  A folder
                  //selected via webkitdirectory sends all the contained
                  //files which is prohibitive for a large music library.
                  //Putting digdat.json in your music library folder faces
                  //similar issues.
                  ["div", {cla:"configitemdiv"},
                   [["div", {cla:"cidescdiv"},
                     "Find my music library at:"],
                    ["input", {type:"text", id:"mlibin", size:40,
                               value:cdat.musicPath}]]],
                  ["div", {cla:"configitemdiv"},
                   [["div", {cla:"cidescdiv"},
                     "Move my song rating database to:"],
                    ["input", {type:"text", id:"dbfin", size:40,
                               value:cdat.dbPath}]]],
                  ["div", {id:"configstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv"},
                   [["button", {type:"button", id:"cicancelb",
                                title:"Restart without changing config",
                                onclick:mdfs("cfg.restart")},
                    "Cancel"],
                    ["button", {type:"button", id:"cichangeb",
                                title:"Restart with config changes",
                                onclick:mdfs("cfg.updateConfig")},
                    "Update"]]]]])); },
        confirmStart: function () {
            jt.out("topdlgdiv", jt.tac2html(
                ["div", {cla:"confirmdiv"},
                 ["Restart Digger into config change mode?",
                  ["div", {cla:"dlgbuttonsdiv"},
                   [["button", {type:"button", title:"Cancel mode change",
                                onclick:mdfs("gen.togtopdlg", "la")},
                     "Nevermind"],
                    ["button", {type:"button", title:"Restart in config mode",
                                onclick:mdfs("cfg.launch")},
                     "Ok"]]]]])); }
    };  //end of mgrs.cfg returned functions
    }());


    //Ignore Folders manager handles folders to be ignored on scan/play.
    mgrs.igf = (function () {
        var igfolds = null;
        var activeFolderName = "";
        function getAccountIgnoreFolders () {
            var aifs = mgrs.aaa.getAccount().igfolds || [];
            if(!Array.isArray(aifs)) { aifs = []; }
            return aifs; }
    return {
        igMusicFolders: function () {
            jt.out(tddi, jt.tac2html(
                ["div", {id:"igfouterdiv"},
                 [["div", {id:"igfdiv"}],
                  ["div", {id:"igfindiv"}],
                  ["div", {id:"igfstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv", id:"igfbdiv"},
                   ["button", {type:"button", id:"igfaddb",
                               onclick:mdfs("igf.addIgnoreFolder")},
                    "Add"]]]]));
            mgrs.igf.redrawIgnoreFolders(); },
        redrawIgnoreFolders: function () {
            igfolds = getAccountIgnoreFolders();
            if(!jt.byId("igfdiv")) {  //not currently displaying
                return; }
            jt.out("igfdiv", jt.tac2html(
                ["table", {id:"igftable"},
                 igfolds.map((fname, idx) =>
                     ["tr", {cla:"igftr", id:"igftr" + idx},
                      [["td", fname],
                       ["td", ["a", {href:"#Remove", title:"Remove " + fname,
                                     onclick:mdfs("igf.removeIgnoreFolder",
                                                  fname)},
                               ["img", {cla:"rowbuttonimg",
                                        src:"img/trash.png"}]]]]])]));
            if(activeFolderName) {
                const tr = jt.byId("igftr" + igfolds.indexOf(activeFolderName));
                if(tr) {
                    tr.scrollIntoView();
                    window.scrollTo(0, 0); }
                activeFolderName = ""; }
            const config = app.pdat.configObj();
            jt.out("igfindiv", jt.tac2html(
                [["label", {fo:"igfin"},
                  "Ignore " + config.musicPath + "/**/"],
                 ["input", {type:"text", id:"igfin", size:30}]]));
            jt.out("igfstatdiv", ""); },
        updateIgnoreFolders: function () {
            var acct = mgrs.aaa.getAccount();
            acct.igfolds = igfolds;
            jt.out("igfstatdiv", "Updating ignore folders...");
            mgrs.aaa.updateCurrAcct(acct, acct.token,
                function () {
                    jt.out("igfstatdiv", "");
                    mgrs.igf.unmarkIgnoreSongs();
                    mgrs.igf.markIgnoreSongs();
                    mgrs.aaa.notifyAccountChanged("igfolders");
                    app.pdat.writeDigDat("igf.updateIgnoreFolders"); },
                function (code, errtxt) {
                    jt.out("kwupdstatdiv", String(code) + ": " + errtxt); }); },
        removeIgnoreFolder: function (foldername) {
            igfolds = igfolds.filter((fn) => fn !== foldername);
            mgrs.igf.updateIgnoreFolders(); },
        addIgnoreFolder: function () {
            var afn = jt.byId("igfin").value || "";
            afn = afn.trim();
            if(!afn) {
                return mgrs.igf.redrawIgnoreFolders(); }
            activeFolderName = afn;
            if(igfolds.indexOf(afn) < 0) {  //doesn't already exist
                igfolds.push(afn);
                igfolds.sort(); }
            mgrs.igf.updateIgnoreFolders(); },
        unmarkIgnoreSongs: function () {
            Object.values(app.pdat.songsDict()).forEach(function (s) {
                if(s.fq.startsWith("I")) {
                    s.fq = s.fq.slice(1); } }); },
        markIgnoreSongs: function () {
            igfolds = igfolds || getAccountIgnoreFolders();
            const songsDict = app.pdat.songsDict();
            Object.entries(songsDict).forEach(function ([p, s]) {
                if((!s.fq || !s.fq.match(/^[DU]/)) && mgrs.igf.isIgPath(p)) {
                    //jt.log("Ignoring " + s.ti);  //can be a lot of output..
                    s.fq = "I" + s.fq; } }); },
        isIgPath: function (p) {
            var pes = p.split("/");
            if(pes.length <= 1) {  //top level file, or windows
                pes = p.split("\\"); }  //try splitting with windows path delim
            if(pes.length > 1) {   //have folder(s) + filename
                return pes.slice(0, pes.length - 1).some((pe) =>
                    igfolds.some((igf) =>
                        (pe === igf || (igf.endsWith("*") &&
                                        pe.startsWith(igf.slice(0, -1)))))); }
            return false; },
        resetIgnoreFolders: function (folderNamesArray) {
            igfolds = folderNamesArray; }
    };  //end of mgrs.igf returned functions
    }());


    //Keyword manager handles keywords in use for the library.
    mgrs.kwd = (function () {
        var kwdefs = null;  //curracct kwdefs
        var uka = null;  //update keywords array (UI form data)
        var vizuka = null;  //ignored keywords filtered out
    return {
        initialize: function () {
            app.pdat.addConfigListener("top.kwd", mgrs.kwd.rebuildKeywords);
            app.pdat.addDigDatListener("top.kwd", mgrs.kwd.rebuildKeywords); },
        countSongKeywords: function () {
            if(!app.pdat.dbObj()) { return; }  //nothing to count yet
            Object.values(kwdefs).forEach(function (kd) { kd.sc = 0; });
            Object.values(app.pdat.songsDict()).forEach(function (song) {
                song.kws = song.kws || "";
                song.kws.csvarray().forEach(function (kw) {
                    if(!kwdefs[kw]) {
                        kwdefs[kw] = {pos:0, sc:0, ig:0}; }
                    kwdefs[kw].sc += 1; }); }); },
        verifyKeywordDefinitions: function () {
            if(!kwdefs || Object.keys(kwdefs).length < 4) {
                kwdefs = JSON.parse(JSON.stringify(
                    mgrs.aaa.getDefaultKeywordDefinitions())); } },
        rebuildKeywords: function () {
            kwdefs = mgrs.aaa.getAccount().kwdefs;
            mgrs.kwd.verifyKeywordDefinitions();
            mgrs.kwd.countSongKeywords(); },
        defsArray: function (actfirst) {
            mgrs.kwd.verifyKeywordDefinitions();
            const kds = Object.entries(kwdefs).map(function ([k, d]) {
                return {pos:d.pos, sc:d.sc, ig:d.ig, kw:k, dsc:d.dsc}; });
            const aks = kds.filter((kd) => !kd.ig);
            aks.sort(function (a, b) {
                if(actfirst) {
                    if(a.pos && b.pos) { return a.pos - b.pos; }
                    if(a.pos && !b.pos) { return -1; }
                    if(!a.pos && b.pos) { return 1; } }
                return a.kw.localeCompare(b.kw); });
            return aks; },
        makePosSel: function (kw, pos) {
            var pivs = ["-", "1", "2", "3", "4"];  //position indicator values
            var ofs = 0;
            if(vizuka.length <= 4) {
                pivs = pivs.slice(1);
                ofs = 1; }
            return jt.tac2html(
                ["select", {id:"posel" + kw, title:"UI position of " + kw,
                            onchange:mdfs("kwd.posChange", kw)},
                 pivs.map((opt, i) => 
                     ["option", {value:i + ofs, 
                                 selected:jt.toru(pos === i + ofs)},
                      opt])]); },
        posChange: function (kw) {
            var ukd = uka.find((kd) => kd.kw === kw);
            var upv = Number(jt.byId("posel" + kw).value);
            var pkd = uka.find((kd) => kd.pos === upv);
            pkd.pos = ukd.pos;
            ukd.pos = upv;
            mgrs.kwd.redrawUpdateForm(); },
        makeTrash: function (kw, pos) {
            var html = ["img", {cla:"rowbuttonimg", src:"img/trashdis.png"}];
            if(!pos) {  //not currently selected as a display keyword
                html = ["a", {href:"#Ignore_" + kw,
                              onclick:mdfs("kwd.trashKeyword", kw)},
                        ["img", {cla:"rowbuttonimg", src:"img/trash.png"}]]; }
            return jt.tac2html(html); },
        trashKeyword: function (kw) {
            var ukd = uka.find((kd) => kd.kw === kw);
            ukd.ig = 1;
            mgrs.kwd.redrawUpdateForm(); },
        togKwdDesc: function (kw) {
            var kdd = jt.byId(kw + "descrdiv");
            if(kdd) {
                if(kdd.style.display === "none") {
                    kdd.style.display = "block"; }
                else {
                    kdd.style.display = "none"; } } },
        redrawUpdateForm: function () {
            vizuka = uka.filter((kd) => !kd.ig);
            jt.out("kwupdtablediv", jt.tac2html(
                ["table", {id:"kwdseltable"},
                 vizuka.map((kwd) =>
                     [["tr", {cla:"kwdtr"},
                       [["td", mgrs.kwd.makePosSel(kwd.kw, kwd.pos)],
                        ["td", ["a", {href:"#Describe" + kwd.kw,
                                      onclick:mdfs("kwd.togKwdDesc", kwd.kw)},
                                kwd.kw]],
                        ["td", kwd.sc],
                        ["td", mgrs.kwd.makeTrash(kwd.kw, kwd.pos)]]],
                      ["tr", {cla:"kwdesctr"},
                       [["td"],
                        ["td", {colspan:3},
                         ["div", {id:kwd.kw + "descrdiv", cla:"kddescrdiv",
                                  style:"display:none", contentEditable:true},
                          kwd.dsc || ""]]]]])])); },
        chooseKeywords: function () {
            mgrs.kwd.countSongKeywords();  //recount in case keyword was toggled
            uka = mgrs.kwd.defsArray();
            jt.out(tddi, jt.tac2html(
                ["div", {id:"kwupdiv"},
                 [["div", {id:"kwupdtablediv"}],
                  ["div", {id:"kwupdstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv", id:"kwdefbdiv"},
                   ["button", {type:"button", id:"kwdefupdb",
                               onclick:mdfs("kwd.saveKeywordDefs")},
                    "Update"]]]]));
            mgrs.kwd.redrawUpdateForm(); },
        keywordDefsError: function () {
            //UI should not allow creating an invalid kwdefs state. Verify.
            var errmsg = "";
            if(uka.length < 4) {
                errmsg = "Four keywords required."; }
            const ords = [{n:"first", v:1}, {n:"second", v:2}, {n:"third", v:3},
                          {n:"fourth", v:4}];
            ords.reverse().forEach(function (ord) {
                if(!uka.find((kwd) => kwd.pos === ord.v)) {
                    errmsg = "Missing " + ord.n + " keyword."; } });
            if(errmsg) {
                jt.out("kwupdstatdiv", errmsg);
                jt.byId("kwdefupdb").disabled = false; }
            return errmsg; },
        saveKeywordDefs: function () {
            //either showing the full keywords form, or swapping a kwtog ctrl
            if(jt.byId("kwdefupdb")) {  //called from local form
                jt.byId("kwdefupdb").disabled = true;  //debounce button
                jt.out("kwupdstatdiv", "Saving..."); }
            if(mgrs.kwd.keywordDefsError()) { return; }
            const acct = mgrs.aaa.getAccount();
            uka.forEach(function (kd) {  //update kwdefs directly
                var def = {pos:kd.pos, sc:kd.sc, ig:kd.ig, dsc:kd.dsc || ""};
                var descr = jt.byId(kd.kw + "descrdiv");
                if(descr) {
                    descr = descr.innerText || "";
                    def.dsc = descr.trim(); }
                acct.kwdefs[kd.kw] = def; });
            mgrs.aaa.updateCurrAcct(acct, acct.token,
                function () {
                    mgrs.gen.togtopdlg("", "close");
                    mgrs.aaa.notifyAccountChanged("keywords"); },
                function (code, errtxt) {
                    jt.out("kwupdstatdiv", String(code) + ": " + errtxt); }); },
        same: function (kwa, kwb) {  //localeCompare base not yet on mobile
            return kwa.toLowerCase() === kwb.toLowerCase(); },
        addKeyword: function (kwd) {  //called from player
            var kd;
            uka = uka || mgrs.kwd.defsArray();
            kd = uka.find((kd) => mgrs.kwd.same(kd.kw, kwd));
            if(kd) {  //already exists and not previously deleted, bump count
                kd.sc += 1; }
            else {  //not in current working set
                kd = kwdefs[kwd];
                if(kd) {  //previously existed, add adjusted copy
                    kd = {kw:kwd, pos:0, sc:kd.sc + 1, ig:0}; }
                else {  //brand new keyword
                    kd = {kw:kwd, pos:0, sc:1, ig:0}; }
                uka.push(kd); }
            mgrs.gen.togtopdlg("", "close");  //in case open
            mgrs.kwd.saveKeywordDefs(); },
        swapFilterKeyword: function (kwd, pos) {  //called from filter
            uka = uka || mgrs.kwd.defsArray();
            const prevkd = uka.find((kd) => kd.pos === pos);
            prevkd.pos = 0;
            const currkd = uka.find((kd) => kd.kw === kwd);
            currkd.pos = pos;
            mgrs.gen.togtopdlg("", "close");  //in case open
            mgrs.kwd.saveKeywordDefs("swapFilterKeyword"); }
    };  //end of mgrs.kwd returned functions
    }());


    //Local Carry Manager helps with local copy download/offload suggestions
    mgrs.lcm = (function () {
        const dbps = [{v:"permanentCollection", t:"Permanent Collection"},
                      {v:"localCopy", t:"Local Copy"}];
        const crd = {};
        const aso = {sel:"albums",
                     opts:[{v:"albums", t:"Albums"},
                           {v:"singles", t:"Singles"}],
                     hdat:{albums:null, singles:null},
                     lookup:null};
        const fbk = {active:false, keyword:"Any", kwds:["Any"]};
        const fsos = [{v:"M", t:"Already have this. Metadata mismatch."},
                      {v:"R", t:"Just never suggest this."}];
        function resetCarryData () {
            crd.ars={};  crd.abs={};  crd.sks={};  crd.psc=0; }
        function carryLenDisp (fld) {
            return Object.keys(crd[fld]).length; }
        function updateOffloadStats (dbpt, ts, song) {
            ts.ac += 1;  //bump album song count
            if(song.lp && song.lp.localeCompare(ts.mrp) > 0) {
                ts.mrp = song.lp; }  //note most recent song play off album
            if(song.rv <= 4) { //two or fewer stars
                ts.dpath = ts.dpath || song.path;
                ts.dc += 1; }  //bump dud count for album
            const fqe = app.filter.dispatch("fq", "isPlaybackEligible", song);
            if(fqe && song.rv >= 8) {  //4+ stars and playable
                ts.hc += 1; }  //bump hit count for album
            if(dbpt !== "permanentCollection") {  //localCopy
                if(song.rv > 4 && //not already counted as a dud
                   song.fq && song.fq.match(/[BZOR]/) && //tired or ref only
                   !fqe) {  //not eligible to play
                    ts.tpath = ts.tpath || song.path;
                    ts.tc += 1; } } } //bump tired count for album
        function rebuildCarryData () {
            const dbpt = mgrs.aaa.getCollectionStyle();
            resetCarryData();
            const sd = app.deck.dispatch("sdt", "getSongsDict");
            Object.values(sd).forEach(function (song) {
                if(app.deck.isPlayable(song)) {
                    crd.psc += 1;  //update song count
                    crd.ars[song.ar] = crd.ars[song.ar] || song.ar;  //artist
                    //note album
                    const ab = song.ab || song.ar + "Singles";
                    crd.abs[ab] = crd.abs[ab] || {
                        ar:song.ar, ac:0, dc:0, tc:0, hc:0, apath:song.path,
                        mrp:"1970-01-01T00:00:00Z"};
                    updateOffloadStats(dbpt, crd.abs[ab], song);
                    //note song key for hub interaction
                    const sk = song.ar + song.ab + song.ti;
                    crd.sks[sk] = song.ti; } }); }
        function carryReportTotalsHTML () {
            return jt.tac2html(
                [["div", {cla:"crsumitemdiv"},
                  [["span", {cla:"crsumitemval"}, carryLenDisp("ars")],
                   ["span", {cla:"crsumitemattr"}, "Artists"]]],
                 ["div", {cla:"crsumitemdiv"},
                  [["span", {cla:"crsumitemval"}, carryLenDisp("abs")],
                   ["span", {cla:"crsumitemattr"}, "Albums"]]],
                 ["div", {cla:"crsumitemdiv"},
                  //"sks" has unique ti/ar/ab keys without dupes.  That can be
                  //confusingly less than the total as displayed in deck info.
                  [["span", {cla:"crsumitemval"}, crd.psc || "0"],
                   ["span", {cla:"crsumitemattr"}, "Songs"]]]]); }
        function permCollOrCarryHTML () {
            var dbpt = mgrs.aaa.getCollectionStyle();
            return jt.tac2html(
                [["div", {cla:"crsectitdiv"}, "Song file persistence:"],
                 dbps.map((dbp) =>
                     ["div", {cla:"radiobdiv"},
                      [["input", {type:"radio", id:dbp.v + "RadioButton",
                                  name:"dbpoption", value:dbp.v,
                                  checked:jt.toru(dbpt === dbp.v),
                                  onclick:mdfs("aaa.setCollectionStyle",
                                               dbp.v)}],
                       ["label", {fo:dbp.v + "RadioButton"}, dbp.t]]])]); }
        function isOffloadEligible(stats) {
            if(stats.hc) {
                return false; } //at least one high rated play-eligible song
            if(!stats.dc && !stats.tc) {
                return false; } //no duds and nothing tired
            return true; }  //possibly offloadable
        function findOffloadableAlbums () {
            var oas = [];
            Object.entries(crd.abs).forEach(function ([k, d]) {
                if(isOffloadEligible(d)) {
                    const dtc = d.dc + d.tc;  //duds and ineligible tired
                    const bp = Math.round((dtc * 100) / d.ac);  //bad song pcnt
                    const ia = ((d.ac > 2)? 1 : 0);  //1 if more than a single
                    if(bp > 50) {  //if more than half of album is ok, keep it
                        oas.push({ar:d.ar, ab:k, ac:d.ac, mrp:d.mrp,
                                  path:d.dpath || d.tpath || d.apath,
                                  iat:ia, bpc:bp}); } } });
            //Albums before singles.  Highest badness first.  Within
            //equally bad albums, prefer least recently played because if
            //you play a song off the album and don't delete it, then it
            //should move down in the suggestions order.  If all else equal,
            //prefer longer albums since since they will free up more space.
            oas.sort(function (a, b) {
                return ((b.iat - a.iat) ||  //albums before singles
                        (b.bpc - a.bpc) ||  //highest badness percent first
                        a.mrp.localeCompare(b.mrp) ||  //least recently played
                        (b.ac - a.ac)); }); //longer albums first
            oas = oas.slice(0, 3);  //manageable number to actually consider
            return oas; }
        function suggestedOffloadsHTML () {
            const oas = findOffloadableAlbums();
                var sughtml = jt.tac2html(
                  ["ul", {cla:"suggul"},
                   oas.map((oa) =>
                      ["li",
                       [["span", {cla:"carryarspan"}, oa.ar],
                        "&nbsp;-&nbsp;",
                        ["a", {href:"#playalbum",
                               onclick:mdfs("lcm.showAlbum",
                                            jt.escq(oa.path))},
                         ["span", {cla:"carryabspan"}, oa.ab]],
                        ["span", {cla:"carrypcntspan"}, oa.bpc + "%"]]])]);
            if(!oas.length) {
                sughtml = "&nbsp; No offload suggestions."; }
            return jt.tac2html(
                ["div", {id:"suggoffdiv"},
                 [["div", {cla:"crsectitdiv"}, "Suggested offloads:"],
                  sughtml]]); }
        function albSingleSelHTML () {
            return jt.tac2html(aso.opts.map((as) =>
                ["div", {cla:"radiobdiv"},
                 [["input", {type:"radio", id:as.v + "RadioButton",
                             name:"asoption", value:as.v,
                             checked:jt.toru(as.v === aso.sel),
                             onclick:mdfs("lcm.suggDownType", as.v)}],
                  ["label", {fo:as.v + "RadioButton"}, as.t]]])); }
        function keywordSelHTML () {
            fbk.kwds = mgrs.kwd.defsArray();
            fbk.kwds.unshift({kw:"Any"});
            return jt.tac2html(
                [["input", {type:"checkbox", id:"dwninckwin", value:"withkw",
                            checked:jt.toru(fbk.active),
                            onclick:mdfs("lcm.toggleKWFilterActive")}],
                 ["label", {fo:"dwninckwin"}, "Including keyword"],
                 "&nbsp;",
                 ["select", {id:"dwnkwd", title:"Required keyword",
                             onchange:mdfs("lcm.keywordChange")},
                  fbk.kwds.map((kw) =>
                      ["option", {value:kw.kw,
                                  selected:jt.toru(kw.kw === fbk.keyword)},
                       kw.kw])]]); }
        function suggestedDownloadsHTML () {
            return jt.tac2html(
                [["div", {cla:"crsectitdiv"}, "Suggested downloads:"],
                 ["div", {id:"crdalbsindiv"}, albSingleSelHTML()],
                 ["div", {id:"crdkwdseldiv"}, keywordSelHTML()],
                 ["div", {id:"crdsuggsdiv"}, "Checking DiggerHub"]]); }
        function notLocallyAvailable (dls) {
            if(!aso.lookup) {
                aso.lookup = {};  //artist:{alb:sc, alb2:sc2}
                const sd = app.deck.dispatch("sdt", "getSongsDict");
                const lkp = aso.lookup;
                Object.values(sd).forEach(function (s) {
                    if(app.deck.isPlayable(s)) {
                        lkp[s.ar] = lkp[s.ar] || {};
                        lkp[s.ar][s.ab] = lkp[s.ar][s.ab] || 0;
                        lkp[s.ar][s.ab] += 1; } }); }
            return dls.filter((dl) =>
                !aso.lookup[dl.ar] || !aso.lookup[dl.ar][dl.ab]); }
        function hasRequiredKeyword (dls) {
            if(!fbk.active || fbk.keyword === "Any") {
                return dls; }
            return dls.filter((dl) =>
                dl.kws && dl.kws.indexOf(fbk.keyword) >= 0); }
        function computeDisplayDataAndSort (dls) {
            dls.forEach(function (dl) { dl.vr = Math.round(dl.sr / dl.qc); });
            dls = dls.sort(function (a, b) {
                return (b.vr - a.vr); });
            return dls.slice(0, 5); }
        function displayDownloadSuggestions () {
            var dls = aso.hdat[aso.sel];
            jt.out("crdsuggsdiv", "Checking " + dls.length + " " + aso.sel);
            dls = notLocallyAvailable(dls);
            dls = hasRequiredKeyword(dls);
            dls = computeDisplayDataAndSort(dls);
            if(!dls.length) {
                return jt.out("crdsuggsdiv", jt.tac2html(
                    ["No " + aso.opts[aso.sel].t + " download suggestions",
                     ["div", {id:"recslinkdiv"},
                      ["a", {href:"#getrecommendation",
                             onclick:mdfs("gen.togtopdlg", "am")},
                       "Get recommendations"]]])); }
            jt.out("crdsuggsdiv", jt.tac2html(
                ["div", {id:"suggdowndiv"},
                 [["div", {cla:"crsectitdiv"}, "Suggested downloads:"],
                  ["ul", {cla:"suggul"},
                   dls.map((dl, idx) =>
                      ["li",
                       [["span", {cla:"carryarspan"}, dl.ar],
                        "&nbsp;-&nbsp;",
                        ["a", {href:"#fixsuggestion",
                               onclick:mdfs("lcm.fixSuggestion", idx,
                                            dl.ar, dl.ab)},
                         ["span", {cla:"carryabspan"}, dl.ab]],
                        ["span", {cla:"carrypcntspan"}, dl.vr],
                        ["div", {id:"fixdlsuggdiv" + idx,
                                 style:"display:none;"}]]])]]])); }
        function rebuildSuggestedDownloads () {
            jt.out("dwnloadsdiv", suggestedDownloadsHTML());
            const acct = mgrs.aaa.getAccount();
            if(!acct || acct.dsId === "101") {
                return jt.out("crdsuggsdiv", jt.tac2html(
                    ["a", {href:"#signin",
                           onclick:mdfs("gen.togtopdlg", "am")},
                     "Sign in for download suggestions."])); }
            if(!aso.hdat[aso.sel]) {
                jt.out("crdsuggsdiv", "Calling DiggerHub...");
                const stp = aso.sel;
                mgrs.hcu.makeHubCall("suggdown", {
                    verb:"GET",
                    url:app.util.cb("suggdown",
                                    app.util.authdata({suggtype:stp})),
                    contf:function (suggs) {
                        jt.out("crdsuggsdiv", stp + " data received.");
                        aso.hdat[stp] = suggs;
                        rebuildSuggestedDownloads(); },
                    errf:function (code, errtxt) {
                        jt.out("crdsuggsdiv", "Call failed " + code +
                               ": " + errtxt); }});
                return; }
            displayDownloadSuggestions(); }
    return {
        fixSuggestion: function (idx, ar, ab) {
            const div = jt.byId("fixdlsuggdiv" + idx);
            if(div.style.display !== "none") {  //toggle off
                div.style.display = "none";
                return; }
            div.style.display = "block";
            div.innerHTML = jt.tac2html(
                [["div", {id:"fsoptsdiv" + idx},
                  fsos.map((fso) =>
                      ["div", {cla:"oneselperlinediv"},
                       [["input", {type:"radio", id:fso.v + "RadioButton",
                                   checked:jt.toru(fso.v === "M"),
                                   name:"fsoption", value:fso.v}, fso.v],
                        ["label", {fo:fso.v + "RadioButton"}, fso.t]]])],
                 ["div", {id:"fsbuttondiv" + idx, cla:"dlgbuttonsdiv"},
                  ["button", {type:"button", id:"fixsuggb" + idx,
                              onclick:mdfs("lcm.hubfixSuggestion", idx,
                                           ar, ab)},
                   "Remove Suggestion"]],
                 ["div", {id:"fixdlstatdiv" + idx}]]); },
        hubfixSuggestion: function (idx, ar, ab) {
            const ufq = document.querySelector("input[name=fsoption]:checked")
                  .value;
            const acct = mgrs.aaa.getAccount();
            jt.out("fixdlstatdiv" + idx, "Updating hub...");
            mgrs.hcu.makeHubCall("nosugg", {
                verb:"POST",
                dat:jt.objdata({an:acct.email, at:acct.token,
                                artist:ar, album:ab, fq:ufq}),
                contf:function (songs) {
                    aso.lookup[ar] = aso.lookup[ar] || {};
                    aso.lookup[ar][ab] = -1 * songs.length;
                    rebuildSuggestedDownloads(); },
                errf:function (code, errtxt) {
                    jt.out("fixdlstatdiv" + idx, "Hub update failed " + code +
                           ": " + errtxt); }}); },
        suggDownType: function (val) {
            aso.sel = val;
            rebuildSuggestedDownloads(); },
        toggleKWFilterActive: function () {
            fbk.active = !fbk.active;
            rebuildSuggestedDownloads(); },
        keywordChange: function () {
            fbk.keyword = fbk.kwds[jt.byId("dwnkwd").selectedIndex].kw;
            rebuildSuggestedDownloads(); },
        showAlbum: function (encpath) {
            const path = jt.dec(encpath);
            const sd = app.deck.dispatch("sdt", "getSongsDict");
            const song = sd[path];
            app.deck.dispatch("alb", "setSongToStartWith", song);
            app.deck.dispatch("gen", "dispMode", "alb"); },
        displayLocalCarryInfo: function () {
            rebuildCarryData();
            jt.out(tddi, jt.tac2html(
                ["div", {id:"carryrptdiv"},
                 [["div", {id:"crttlsdiv"}, carryReportTotalsHTML()],
                  ["div", {id:"crprmcrydiv"}, permCollOrCarryHTML()],
                  ["div", {id:"offloadsdiv"}, suggestedOffloadsHTML()],
                  ["div", {id:"dwnloadsdiv"}, suggestedDownloadsHTML()],
                  ["div", {cla:"dlgbuttonsdiv", id:"crbdiv"},
                   ["button", {type:"button", id:"crbcloseb",
                               onclick:mdfs("gen.togtopdlg", "", "close")},
                    "Close"]]]]));
            rebuildSuggestedDownloads(); }
    };  //end of mgrs.lcm returned functions
    }());


    //Local library actions manager handles lib level actions and data.
    mgrs.locla = (function () {
        var acts;
        var slfrc = "";  //session library file import check
    return {
        initialize: function () {
            acts = [
                {ty:"cfgp", oc:mdfs("cfg.confirmStart"),
                 tt:"Configure music and data file locations", 
                 p:"musicPath", n:"Music Files"},
                {ty:"cfgp", oc:mdfs("cfg.confirmStart"),
                 tt:"Configure music and data file locations",
                 p:"dbPath", n:"Digger Data"},
                {ty:"info", htmlfs:"versionInfoHTML"},
                {ty:"info", htmlfs:"getLatestVersionHTML", id:"updversionnote"},
                {ty:"info", htmlfs:"hubSyncInfoHTML"},
                {ty:"btn", oc:mdfs("locla.libimpNeeded", "reread"),
                 tt:"Read all files in the music folder",
                 n:"Read Files", id:"readfilesbutton"},
                {ty:"btn", oc:mdfs("lcm.displayLocalCarryInfo"),
                 tt:"Display local collection info",
                 n:"Carry", id:"localcarrybutton"},
                {ty:"btn", oc:mdfs("igf.igMusicFolders"),
                 tt:"Ignore folders when reading music files",
                 n:"Ignore Folders", id:"ignorefldrsbutton"},
                {ty:"btn", oc:mdfs("kwd.chooseKeywords"),
                 tt:"Select active keywords for filtering",
                 n:"Active Keywords", id:"choosekwdsbutton"},
                {ty:"btn", oc:mdfs("aaa.toggleDarkMode"),
                 tt:"Toggle dark mode display",
                 dynamicName:mgrs.aaa.getDarkModeButtonDisplayName,
                 n:"Dark", id:"darkmodebutton"}];
            acts = acts.filter((a) => app.svc.topLibActionSupported(a)); },
        writeDlgContent: function () {
            const cfo = app.pdat.configObj();
            acts.forEach(function (a) {
                if(a.dynamicName) {
                    a.n = a.dynamicName(cfo, a); } });
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => (a.ty === "cfgp" &&
                                      app.svc.plat(a.p) === "editable"))
                  .map((a) =>
                      ["div", {cla:"pathdiv"},
                       [["a", {href:"#configure", onclick:a.oc, title:a.tt},
                         ["span", {cla:"pathlabelspan"}, a.n + ": "]],
                        ["span", {cla:"pathspan", id:"cfgp" + a.p + "span"}, 
                         cfo[a.p]]]])],
                 ["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => a.ty === "info")
                  .map((a) =>
                      ["div", {cla:"pathdiv"}, mgrs.locla[a.htmlfs]()])],
                 ["div", {cla:"dlgbstight"},
                  acts.filter((a) => a.ty === "btn")
                  .map((a) =>
                      ["button", {type:"button", id:a.id, title:a.tt,
                                  onclick:a.oc},
                       a.n])]]));
            setTimeout(mgrs.locla.missingMetadataLink, 50); },
        missingMetadataSongs: function () {
            return Object.values(app.pdat.songsDict())
                .filter((s) => ((!s.fq || !s.fq.startsWith("D")) &&
                                s.ar === "Unknown" && s.ab === "Singles")); },
        missingMetadataLink: function () {
            var mmdcount = mgrs.locla.missingMetadataSongs().length;
            //on fixed music config platforms, this info is less useful
            if(!mmdcount || !jt.byId("cfgpmusicPathspan")) { return ""; }
            jt.out("cfgpmusicPathspan", jt.tac2html(
                [jt.byId("cfgpmusicPathspan").innerHTML,
                 " &nbsp; ",
                 ["a", {href:"#missingmetadata", title:"Songs Missing Metadata",
                        onclick:mdfs("locla.displayMMSongs")},
                  "-" + mmdcount + "md"]])); },
        displayMMSongs: function () {
            jt.out(tddi, jt.tac2html(
                ["div", {id:"bmdsongsdiv"},
                 mgrs.locla.missingMetadataSongs().map((s) =>
                     ["div", {cla:"bmdsonglinkdiv"},
                      ["a", {href:"#play" + s.dsId, title:"Play Song" + s.dsId,
                             onclick:mdfs("locla.playSong", s.path)},
                       s.path]])])); },
        playSong: function (path) {
            var song = app.pdat.songsDict()[path];
            app.deck.dispatch("csa", "playGivenSong", song); },
        versionInfoHTML: function () {
            var vstr = app.pdat.songDataVersion();
            if(!vstr) {  //e.g. stubbed demo data
                vstr = app.svc.plat("versioncode") || "vx.x.x"; }
            const versioncode = app.svc.plat("versioncode");  //build number
            if(versioncode) {
                vstr += ", " + versioncode; }
            vstr += ", " + app.fileVersion();
            return jt.tac2html(
                [["span", {cla:"pathlabelgreyspan"}, "Version:"],
                 ["span", {cla:"infospan"}, vstr]]); },
        getLatestVersionHTML: function () {
            const verstat = mgrs.hcu.getVersionStatus();
            if(!verstat.notice) { return ""; }
            return jt.tac2html(
                [["span", {cla:"pathlabelgreyspan"}, "Update:"],
                 ["span", {cla:"infospan"},
                  verstat.hub + " is available on DiggerHub"]]); },
        hubSyncInfoHTML: function () {
            if(!app.util.haveHubCredentials()) { return ""; }
            setTimeout(mgrs.srs.makeStatusDisplay, 100);
            return jt.tac2html(["div", {id:"hubSyncInfoDiv"}]); },
        libimpNeeded: function (reread) {
            if(slfrc && !reread) { return; }
            slfrc = new Date().toISOString();
            setTimeout(function () {
                const llp = app.svc.extensionInterface("libload");
                llp.loadLibrary("toponelinestatdiv"); }, 200); },
        noteLibraryLoaded: function () {
            slfrc = new Date().toISOString(); }
    };  //end mgrs.locla returned functions
    }());


    //Web library actions manager handles lib level actions and data for
    //streaming platforms.  Currently this is just Spotify, where liking an
    //album is separate from liking a track.  In both cases likes are ordered
    //by time, so it is sufficient to check from the last known offset.
    //developer.spotify.com/documentation/web-api/reference/#category-library
    mgrs.webla = (function () {
        var acts;  //library actions
        var spip = {  //spotify import processing
            mode:"done",        //"scheduled", "albums", "tracks"
            sto: null,          //scheduling timeout
            maxconnretries:3};  //player connection wait count
        function getSpi () {
            var spi = app.login.getAuth().settings.spimport;
            if(!spi || (spi.lastcheck > "2020" &&
                        spi.lastcheck < "2021-07-10")) {  //server version check
                spi = {lastcheck:"",
                       offsets:{albums:0, tracks:0},
                       imported:0, existing:0}; }
            return spi; }
        function impstat (txt) {
            jt.log("impstat: " + txt);
            if(jt.byId("nomusicstatdiv")) {  //alternate status display area
                const stat = getSpi();
                jt.out("nomusicstatdiv", jt.tac2html(
                    ["Spotify library lookup ",
                     ["span", {id:"spalbcountspan"}, stat.offsets.albums],
                     " Albums, ",
                     ["span", {id:"sptrkcountspan"}, stat.offsets.tracks],
                     " Tracks, ",
                     txt])); }
            else {  //replace button with import message, or log if unavailable.
                jt.out("spimpbspan", txt); } }
        function recentlyChecked (stat) {
            return (stat && stat.lastcheck &&
                    jt.timewithin(stat.lastcheck, "days", 1)); }
    return {
        initialize: function () {
            acts = [  
                {ty:"stat", lab:"Spotify song count", id:"spscval",
                 valfname:"songCount"},
                {ty:"stat", lab:"Spotify library", id:"splibval",
                 valfname:"splibStat"},
                {ty:"btn", oc:mdfs("kwd.chooseKeywords"),
                 tt:"Choose keywords to use for filtering",
                 n:"Choose Keywords"}]; },
        songCount: function () {
            var scs = app.login.getAuth().settings.songcounts;
            if(!scs || scs.posschg > scs.fetched) {
                const hlco = app.svc.extensionInterface("hublocal");
                hlco.getSongTotals(
                    function () {
                        jt.out("spscval", mgrs.webla.songCount()); },
                    function (code, errtxt) {
                        jt.out("spscval", code + ": " + errtxt); });
                return "Calculating..."; }
            if(scs.hubdb === 0) {
                return "No songs yet"; }
            return scs.spotify + "/" + scs.hubdb + " (" +
                (Math.round((scs.spotify / scs.hubdb) * 100)) + "%)"; },
        handleSpotifyLibraryData: function (obj) {
            if(!obj.items.length) {  //no more items returned from query
                if(spip.mode === "albums") {
                    spip.mode = "tracks";
                    return mgrs.webla.spimpProcess(); }
                else {  //Done with import, note completed
                    const acct = mgrs.aaa.getAccount();
                    getSpi().lastcheck = new Date().toISOString();
                    return mgrs.aaa.updateCurrAcct(acct, acct.token,
                        function () {
                            impstat("checked just now");
                            spip.mode = "done"; },
                        function (code, errtxt) {
                            impstat("spimp note " + code + ": " + errtxt);
                            spip.mode = "done"; }); } }
            impstat("merging...");
            const hlco = app.svc.extensionInterface("hublocal");
            hlco.spotifyImport(spip.mode, obj.items,
                function (results) {
                    var stat = getSpi();
                    jt.out("spalbcountspan", stat.offsets.albums);
                    jt.out("sptrkcountspan", stat.offsets.tracks);
                    const songs = results.slice(1);
                    hlco.addSongsToPool(songs);
                    mgrs.webla.spimpProcess(); },
                function (code, errtxt) {
                    spip.mode = "done";
                    impstat("merge failed " + code + ": " + errtxt); }); },
        spimpProcess: function () {
            var stat = getSpi();
            if(spip.mode === "done") {  //already checked recently
                return impstat("done."); }
            if(spip.mode === "scheduled") { spip.mode = "albums"; }
            impstat("checking " + spip.mode + "...");
            const spurl = `me/${spip.mode}?offset=${stat.offsets[spip.mode]}`;
            const scco = app.svc.extensionInterface("spotcall");
            scco.sjc(spurl, "GET", null,
                function (obj) {
                    mgrs.webla.handleSpotifyLibraryData(obj); },
                function (code, msg) {
                    spip.mode = "done";
                    impstat("fetch failed " + code + ": " + msg); }); },
        scheduleImportProcess: function (context) {
            if(spip.sto) {
                return impstat("scheduled..."); }
            spip.sto = setTimeout(function () {
                spip.sto = null;
                const spconn = app.player.dispatch("spa", "getPlayerStatus");
                if(spconn === "connected") {
                    if(context === "playstart") {  //yield to player startup
                        spip.mode = "done";
                        return mgrs.webla.spimpNeeded(); } }
                else { //not connected, try waiting
                    spip.mode = "done";
                    impstat("Waiting for connection..." +
                            (spip.maxconnretries || ""));
                    if(spip.maxconnretries > 0) {
                        spip.maxconnretries -= 1;
                        return mgrs.webla.spimpNeeded(); } }
                //Try import. Player may never be ready if no songs.
                impstat("importing...");
                if(!spip.mode || spip.mode === "done") {
                    spip.mode = "scheduled"; }
                mgrs.webla.spimpProcess(); }, 2000); },
        spimpNeeded: function (context) {
            var stat = getSpi(); context = context || "";
            jt.log("spimpNeeded " + context + " " + JSON.stringify(stat));
            if(spip.mode && spip.mode !== "done") {
                impstat("processing " + spip.mode + "...");
                return; }
            impstat("fetching...");  //replace button if displayed
            if(context === "useraction" || !recentlyChecked(stat)) {
                mgrs.webla.scheduleImportProcess(context); }
            else {  //clear interim status, nothing to do.
                impstat("checked Today"); } },
        splibStat: function () {
            var stat = getSpi();
            return jt.tac2html(
                [["span", {id:"spalbcountspan"}, String(stat.offsets.albums)],
                 " Albums, ",
                 ["span", {id:"sptrkcountspan"}, String(stat.offsets.tracks)],
                 " Tracks, ",
                 ["span", {id:"spimpbspan"},
                  //if they open the library display, and checking is ongoing
                  //then this link will be replaced on the next status update.
                  ["a", {onclick:mdfs("webla.spimpNeeded", "useraction"),
                         title:"Read liked albums and tracks from Spotify"},
                   ((!stat.lastcheck)? "Read Library" :
                    ("checked " + jt.colloquialDate(
                        stat.lastcheck, true, "z2loc")))]]]); },
        writeDlgContent: function () {
            mgrs.webla.spimpNeeded();
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => a.ty === "stat")
                  .map((a) =>
                      ["div", {cla:"pathdiv"},
                       [["span", {cla:"pathlabelspan"}, a.lab + ": "],
                        ["span", {cla:"pathspan", id:a.id},
                         mgrs.webla[a.valfname]()]]])],
                 ["div", {cla:"dlgbuttonsdiv"},
                  acts.filter((a) => a.ty === "btn")
                  .map((a) =>
                      ["button", {type:"button", title:a.tt, onclick:a.oc},
                       a.n])]])); }
    };  //end mgrs.webla returned functions
    }());


    //Database check manager verifies the working database object
    mgrs.dbc = (function () {
        var stat = null;
        const sflds = [
            {fn:"el", dv:49, min:0, max:99},
            {fn:"al", dv:49, min:0, max:99},
            {fn:"kws", dv:""},
            {fn:"rv", dv:5, min:1, max:10},
            {fn:"fq", dv:"N"},
            {fn:"lp", dv:""},
            {fn:"pd", dv:""},
            {fn:"nt", dv:""},
            {fn:"pc", dv:0, min:0, max:Number.MAX_SAFE_INTEGER},
            {fn:"srcid", dv:""},
            {fn:"srcrat", dv:""}];
        function err (et) {
            if(stat) {
                stat.verified = false;
                stat.errs.push(et); } }
    return {
        verifySong: function (song) {
            sflds.forEach(function (fld) {
                song[fld.fn] = song[fld.fn] || fld.dv;
                if(fld.min) {
                    song[fld.fn] = Math.max(song[fld.fn], fld.min); }
                if(fld.max) {
                    song[fld.fn] = Math.min(song[fld.fn], fld.max); } }); },
        verifyDatabase: function (dbo) {
            stat = {verified:true, errs:[], count:0, badps:[]};
            if(!dbo) {
                jt.log("verifyDatabase quitting early since no dbo given");
                err("No database object given");
                return stat; }
            if(!dbo.version) {
                err("dbo.version must be set by platform when dbo created"); }
            if(!dbo.songs || typeof dbo.songs !== "object") {
                err("dbo.songs is not an object"); }
            if(Array.isArray(dbo.songs)) {  //arrays are objects...
                err("dbo.songs is an array, not an object"); }
            if(stat.verified) {  //no errors from above checks
                Object.entries(dbo.songs).forEach(function ([path, song]) {
                    if(!song || typeof song !== "object") {
                        stat.badps.push(path);
                        err("song path " + path + " has no song object"); }
                    else {
                        stat.count += 1;
                        song.path = path;  //copy value into song for hub sync
                        mgrs.dbc.verifySong(song); } }); }
            stat.badps.forEach(function (path) {
                jt.log("verifyDatabase deleting bad path: " + path);
                delete dbo.songs[path]; });
            dbo.songcount = dbo.songcount || 0;
            if(dbo.songcount > stat.count) {
                err("probable song loss: dbo.songcount " + dbo.songcount +
                    " > " + stat.count + " in dbo.songs"); }
            if(!dbo.lastSyncPlayback) {
                dbo.lastSyncPlayback = "1970-01-01T00:00:00Z"; }
            dbo.scanned = dbo.scanned || "";
            return stat; }
    };
    }());


    ////////////////////////////////////////////////////////////
    // Export actions
    ////////////////////////////////////////////////////////////

    //Export manager handles process of exporting a playlist
    mgrs.locxp = (function () {
        var dksongs = null;
    return {
        displayExportProgress: function (xob) {
            jt.out("exportdiv", xob.stat.state + " " + xob.stat.copied +
                   " of " + JSON.parse(xob.spec.songs).length); },
        cpxStart: function () {
            var dat = {count:{id:"xttlin", vs:"value"},
                       writepl:{id:"plcb", vs:"checked"},
                       plfilename:{id:"m3ufin", vs:"value"},
                       copymusic:{id:"fccb", vs:"checked"},
                       markplayed:{id:"mpcb", vs:"checked"}};
            Object.entries(dat).forEach(function ([key, attrs]) {
                dat[key] = jt.byId(attrs.id)[attrs.vs]; });
            dat.songs = JSON.stringify(  //array of song paths
                dksongs.slice(0, dat.count).map((s) => s.path));
            const ceco = app.svc.extensionInterface("copyexp");
            ceco.exportSongs(dat,
                function (xob) {  //interim status display
                    mgrs.locxp.displayExportProgress(xob); },
                function (xob) {  //completion
                    mgrs.locxp.displayExportProgress(xob);
                    if(xob.spec.markplayed) {
                        dat.count = parseInt(dat.count, 10);
                        while(dat.count > 1) {
                            dat.count -= 1;
                            app.deck.dispatch("dk", "skip", "cpx", 0); }
                        app.deck.update("song export"); } },
                function (code, errtxt) {
                    jt.out("exportdiv", "Export failed " + code +
                           ": " + errtxt); }); },
        cpxDialog: function () {  //local copy file export
            const cfo = app.pdat.configObj();
            var m3uname = app.filter.dispatch("dsc", "name") + ".m3u";
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"pathdiv"},
                  [["span", {cla:"pathlabelspan"}, "Copy To:"],
                   ["span", {cla:"pathspan"}, cfo.exPath]]],
                 ["div", {id:"exportdiv"},
                  [["div", {cla:"expoptdiv"},
                    [["input", {type:"number", id:"xttlin", size:3, value:20,
                                min:1, max:200}],
                     ["label", {fo:"xttlin"}, " songs from on deck"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"fccb", checked:"checked"}],
                     ["label", {fo:"fccb"}, "Copy music files"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"mpcb", checked:"checked"}],
                     ["label", {fo:"mpcb"}, "Mark songs as played"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"plcb", checked:"checked"}],
                     ["label", {fo:"plcb"}, "Make playlist "],
                     ["label", {fo:"m3ufin"}, " file "],
                     ["div", {id:"exportfileindiv"},
                      ["input", {type:"text", id:"m3ufin", value:m3uname,
                                 placeholder:m3uname, size:28}]]]],
                   ["div", {cla:"dlgbuttonsdiv", id:"exportbuttonsdiv"},
                    ["button", {type:"button", onclick:mdfs("locxp.cpxStart")},
                     "Export"]]]]])); },
        writeDlgContent: function () {
            dksongs = app.deck.dispatch("dk", "songs");
            if(!dksongs.length) {
                return jt.out(tddi, "No songs on deck to export."); }
            mgrs.locxp.cpxDialog(); }
    };  //end mgrs.locxp returned functions
    }());


    //Export manager handles creating or updating a Spotify playlist
    //developer.spotify.com/documentation/general/guides/working-with-playlists
    //developer.spotify.com/documentation/web-api/reference/#category-playlists
    mgrs.webxp = (function () {
        var dksongs = null;
        var xpi = null;   //current persistent export information
        var xps = null;   //account settings exports info
        var xpmax = 100;  //maximum number of songs to write (PUT limit)
        var spud = "";    //spotify user id (username string)
        var spl = null;   //spotify playlist info
        function stat (msg, interim) {
            jt.out("expstatdiv", msg);
            if(interim) {
                jt.byId("exportbuttonsdiv").style.display = "none"; }
            else {
                jt.byId("exportbuttonsdiv").style.display = "block"; } }
        function makeErrFunc (desc) {
            return function (stat, msg) {
                stat(desc + " " + stat + ": " + msg); }; }
    return {
        markSongsPlayed: function () {
            var msg = "Wrote " + xpi.wrttl + " songs to " + xpi.name + ".";
            //Use lp from platform integration to avoid repeats
            jt.out(tddi, msg); },
        notePlaylistWritten: function () {
            stat("Noting playlist written...", true);
            xpi.lastwrite = new Date().toISOString();
            xps.sp[xpi.name] = xpi;
            app.login.getAuth().settings.xps = xps;
            const acct = mgrs.aaa.getAccount();
            mgrs.aaa.updateCurrAcct(acct, acct.token,
                mgrs.webxp.markSongsPlayed,
                function (code, errtxt) {
                    stat("Playlist " + xpi.spid + " settings " +
                         code + ": " + errtxt); }); },
        uploadPlaylistImage: function () {
            stat("Uploading playlist image...");
            const scco = app.svc.extensionInterface("spotcall");
            scco.upldimg(`playlists/${xpi.spid}/images`,
                         "img/appiconcropped.jpg",
                         mgrs.webxp.notePlaylistWritten,
                         function (stat, msg) {
                             jt.log("Playlist image upload failed " + stat +
                                    ": " + msg);
                             mgrs.webxp.notePlaylistWritten(); }); },
        writePlaylistContent: function () {
            stat("Writing songs to playlist...");
            const spuris = dksongs.slice(0, xpi.xttl).map((s) =>
                "spotify:track:" + s.spid.slice(2));
            xpi.wrttl = spuris.length;  //deck might have had fewer
            const scco = app.svc.extensionInterface("spotcall");
            scco.sjc(`playlists/${xpi.spid}/tracks`,
                     "PUT", {uris:spuris},
                     mgrs.webxp.uploadPlaylistImage,
                     makeErrFunc("Write tracks")); },
        verifyPlaylistId: function () {
            stat("Verifying playlist...", true);
            const scco = app.svc.extensionInterface("spotcall");
            if(xpi.spid) {  //fetch the playlist to verify it exists
                scco.sjc(`playlists/${xpi.spid}`,
                    "GET", null,
                    function (obj) {
                        spl = obj;
                        mgrs.webxp.writePlaylistContent(); },
                    function (stat, msg) {
                        jt.log("webxp.verifyPlaylistId " + xpi.spid +
                               "error " + stat + ": " + msg);
                        xpi.spid = "";  //write new playlist
                        mgrs.webxp.verifyPlaylistId(); }); }
            else {  //create new playlist
                stat("Creating new playlist...", true);
                const data = {name:xpi.name,
                              description:app.filter.dispatch("dsc", "desc")};
                scco.sjc(`users/${spud}/playlists`,
                    "POST", data,
                    function (obj) {
                        spl = obj;
                        xpi.spid = spl.id;
                        mgrs.webxp.writePlaylistContent(); },
                    makeErrFunc("Create playlist")); } },
        verifyWrite: function () {
            stat("Validating...", true);
            mgrs.webxp.xpnChange();  //read form vals and update button
            if(!xpi.name) {
                return stat("Name your playlist"); }
            if(!(xpi.xttl >= 1 && xpi.xttl <= xpmax)) {
                return stat("Bad input for how many songs to export."); }
            const scco = app.svc.extensionInterface("spotcall");
            scco.userprof(function (userprof) {
                spud = userprof.id;
                mgrs.webxp.verifyPlaylistId(); }); },
        xpnChange: function () {
            var plname = jt.byId("plnin").value.trim();
            xpi = xps.sp[plname] || {};
            xpi.name = plname;
            xpi.xttl = Number(jt.byId("xttlin").value);
            xpi.mp = jt.byId("mpcb").checked;
            if(xpi.spid) {  //have spotify playlist id from previous write
                jt.out("plxpbutton", "Overwrite"); }
            else {
                jt.out("plxpbutton", "Create"); } },
        writeDlgContent: function () {
            dksongs = app.deck.dispatch("dk", "songs");
            if(!dksongs.length) {
                return jt.out(tddi, "No songs on deck to export."); }
            xps = app.login.getAuth().settings.xps || {};
            xps.sp = xps.sp || {};
            jt.out(tddi, jt.tac2html(
                [["div", {cla:"expoptdiv"},
                  [["label", {fo:"plnin"}, "Playlist Name: "],
                   ["input", {type:"text", id:"plnin", size:28,
                              placeholder:"DiggerPlaylistName",
                              value:"",  //set after dialog created
                              oninput:mdfs("webxp.xpnChange", "event"),
                              list:"xpndatalist"}],
                   ["datalist", {id:"xpndatalist"},
                    Object.keys(xps.sp).sort().map((pln) =>
                        ["option", {value:pln}])]]],
                 ["div", {cla:"expoptdiv"},
                  ["with ",
                   ["input", {type:"number", id:"xttlin", size:3, value:20,
                              min:1, max:xpmax}],
                   ["label", {fo:"xttlin"}, " songs from on deck"]]],
                 ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"mpcb", checked:"checked"}],
                     ["label", {fo:"mpcb"}, "Mark songs as played"]]],
                 ["div", {cla:"dlgbuttonsdiv", id:"exportbuttonsdiv"},
                  ["button", {type:"button", id:"plxpbutton",
                              onclick:mdfs("webxp.verifyWrite")},
                   "Create"]],
                 ["div", {id:"expstatdiv"}]]));
            jt.byId("plnin").value = app.filter.dispatch("dsc", "name");
            mgrs.webxp.xpnChange(); } //verify button name if input val cached
    };  //end mgrs.webxp returned functions
    }());


    ////////////////////////////////////////////////////////////
    // General interface
    ////////////////////////////////////////////////////////////

    //general manager is main interface for the module
    mgrs.gen = (function () {
        function initDisplay () {
            jt.out("pantopdiv", jt.tac2html(
                [["div", {id:"titlediv"},
                  [["div", {id:"titleftdiv"},
                    ["a", {href:"#DiggerHub",
                           onclick:mdfs("gen.togtopdlg", "am")},
                     ["span", {id:"hubtogspan", cla:"titlespan",
                               title:"Sign In or Choose Account"},
                      "Digger"]]],
                   ["div", {id:"titcenterdiv"},
                    ["a", {href:"#database", title:"Library Actions",
                           onclick:mdfs("gen.togtopdlg", "la")},
                     ["img", {cla:"buttonico",
                              src:"img/recordcrate.png"}]]],
                   ["div", {id:"titrightdiv"},
                    [["span", {id:"countspan"}, "Loading..."],
                     ["div", {id:"rtfmdiv"},
                      ["a", {href:"/docs/manual.html", title:"Digger manual",
                             onclick:jt.fs("app.docs.displayDoc('" +
                                           app.overlaydiv +
                                           "','manual.html')")},
                       ["img", {cla:"inv", src:"img/info.png"}]]]]]]],
                 ["div", {id:tddi, "data-mode":"empty"}],
                 ["div", {cla:"statdiv", id:"toponelinestatdiv"}],
                 ["div", {cla:"statdiv", id:"topstatdiv"}]]));
            const tdow = jt.byId("titlediv").offsetWidth;
            const olw = tdow - 44;  //left offset, containing div padding etc
            jt.byId("toponelinestatdiv").style.width = olw + "px"; }
        function updateDiggerNameDisplay () {
            mgrs.gen.updateHubToggleSpan(mgrs.aaa.getAccount()); }
        function checkMessagesAndPrivacy () {
            if(app.util.haveHubCredentials()) {
                setTimeout(function () {
                    mgrs.fma.fetchMessagesIfStale(
                        function () { jt.log("fma.fetchMessages completed"); },
                        function (cd, et) {
                            jt.log("fma.fetchMessages " + cd +
                                   ": " + et); }); },
                           200);
                setTimeout(mgrs.ppc.checkPrivacyPolicyTimestamp, 600); } }
    return {
        initialize: function () {
            initDisplay();
            app.pdat.addConfigListener("top.gen", updateDiggerNameDisplay);
            app.pdat.addApresDataNotificationTask("checkMessagesAndPrivacy",
                                                  checkMessagesAndPrivacy);
            app.pdat.addApresDataNotificationTask("syncToHub",
                                                  mgrs.srs.syncToHub); },
        togtopdlg: function (mode, cmd) {
            var dlgdiv = jt.byId(tddi);
            if(cmd === "close" || (!cmd && dlgdiv.dataset.mode === mode)) {
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = ""; }
            else {
                dlgdiv.dataset.mode = mode;
                if(mode === "am") {  //account management
                    dlgdiv.style.display = "block";
                    dlgdiv.style.margin = "0px";
                    mgrs.afg.accountFanGroup(); }
                else { //"la" - library actions
                    dlgdiv.style.display = "table";
                    dlgdiv.style.margin = "auto";
                    mgrs[app.svc.plat("hdm") + mode].writeDlgContent(); } } },
        updateHubToggleSpan: function (acct) {
            const sdv = app.pdat.dbObj() && app.pdat.songDataVersion();
            const acv = acct && acct.diggerVersion;
            const digversion = acv || sdv || "-";
            jt.byId("hubtogspan").title = "Account Info (" + digversion +
                ", p" + app.fileVersion() + ")";
            jt.out("hubtogspan", acct.firstname); },
        dispCount: function (count, type) {
            switch(type) {
            case "total": count = "+" + count + "&nbsp;songs"; break;
            case "avail": count = String(count) + "&nbsp;songs"; break;
            default: count = String(count); }
            jt.out("countspan", count); }
    };  //end mgrs.gen returned functions
    }());


return {
    init: function () {
        Object.entries(mgrs).forEach(function ([name, mgr]) {
            if(mgr.initialize) {
                jt.log("initializing top." + name);
                mgr.initialize(); } }); },
    markIgnoreSongs: function () { mgrs.igf.markIgnoreSongs(); },
    rebuildKeywords: function () { mgrs.kwd.rebuildKeywords(); },
    dispCount: function (c, t) { mgrs.gen.dispCount(c, t); },
    dispatch: function (mgrname, fname, ...args) {
        try {
            return mgrs[mgrname][fname].apply(app.top, args);
        } catch(e) {
            jt.log("top.dispatch " + mgrname + "." + fname + " " + e +
                   " " + e.stack);
        } }
};  //end of module returned functions
}());
