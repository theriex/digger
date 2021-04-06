/*global app, jt, confirm */
/*jslint browser, white, fudge, long */

//Top panel interface and actions
app.top = (function () {
    "use strict";

    var mgrs = {};  //general container for managers 
    function mdfs (mgrfname, ...args) {  //module dispatch function string
        return app.dfs("top", mgrfname, args);
    }


    ////////////////////////////////////////////////////////////
    // Local Account actions
    ////////////////////////////////////////////////////////////

    //General hub communication utilities
    mgrs.hcu = (function () {
        //account JSON fields
        var ajfs = {kwdefs:{cmp:["pos", "ig", "dsc"]},
                    igfolds:{}, settings:{},
                    guides:{cmp:["dsId", "email", "firstname", "hashtag"]}};
        var verstat = {};
    return {
        serializeAccount: function (acct) {
            Object.keys(ajfs).forEach(function (sf) {
                if(acct[sf] && typeof acct[sf] !== "string") {
                    acct[sf] = JSON.stringify(acct[sf]); } }); },
        deserializeAccount: function (acct) {
            Object.keys(ajfs).forEach(function (sf) {
                if(acct[sf] && typeof acct[sf] === "string") {
                    acct[sf] = JSON.parse(acct[sf]); } }); },
        accountAsData: function (acct) {
            mgrs.hcu.serializeAccount(acct);
            var data = jt.objdata(acct);
            mgrs.hcu.deserializeAccount(acct);
            return data; },
        verifyDefaultAccountFields: function (acct) {
            var aci = mgrs.locam.getAcctsInfo();
            var da = aci.accts.find((a) => a.dsId === "101");
            Object.keys(ajfs).forEach(function (df) {
                acct[df] = acct[df] || da[df] || ""; }); },
        equivField: function (fld, a, b) {  //compare deserialized objs
            if(fld && ajfs[fld] && ajfs[fld].cmp) {
                return ajfs[fld].cmp.every((f) => a[f] === b[f]); }
            return JSON.stringify(a[fld]) === JSON.stringify(b[fld]); },
        accountDisplayDiff: function (a, b) {
            if(!a || !b) { return false; }  //nothing to compare
            var changed = Object.keys(ajfs).find((fld) =>
                !mgrs.hcu.equivField(fld, a, b));
            return changed || false; },
        verifyClientVersion: function () {
            var curracct = mgrs.locam.getAccount();
            if(curracct.hubVersion && curracct.diggerVersion) {
                verstat.hub = curracct.hubVersion;
                verstat.loc = curracct.diggerVersion;
                if(!verstat.notice && verstat.hub !== verstat.loc) {
                    verstat.notice = true;
                    jt.err("You are running " + verstat.loc + ". The hub is " +
                           verstat.hub + ". You might want to download and " +
                           "install the latest version."); } } }
    };  //end mgrs.hcu returned functions
    }());


    //Account To Hub manager handles changes to DiggerHub account info where
    //the change first needs to be reflected locally, then secondarily
    //updated at DiggerHub (if a DiggerHub account has been set up).
    mgrs.a2h = (function () {
        var syt = {tmo:null, stat:"", resched:false};  //sync task info
        var upldsongs = null;
    return {
        handleSyncError: function (code, errtxt) {
            upldsongs = null;
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                //Credentials are no longer valid, so this is old account info
                //and should not be attempting to sync.  To fix, the user will
                //need to sign in again.  Sign them out to start the process.
                mgrs.h2a.signOut(); }
            jt.log("syncToHub " + code + ": " + errtxt); },
        syncToHub: function () {
            var curracct = mgrs.locam.getAccount();
            if(!curracct || curracct.dsId === "101" || !curracct.token) {
                return; }  //invalid account or not set up yet
            if(syt.tmo) {  //already scheduled
                if(syt.stat) {  //currently running
                    syt.resched = true;  //reschedule when finished
                    return; }
                clearTimeout(syt.tmo); }  //not running. reschedule now
            syt.tmo = setTimeout(mgrs.a2h.hubSyncStart, 20 * 1000); },
        hubSyncStart: function () { //see ../../docs/hubsyncNotes.txt
            var curracct = mgrs.locam.getAccount();
            if(curracct.dsId === "101") {
                return jt.log("hubSyncStart aborted since not signed in"); }
            syt.stat = "executing";
            jt.out("modindspan", "hub");  //turn on work indicator
            app.svc.dispatch("loc", "hubSyncDat", mgrs.a2h.makeSendSyncData(),
                function (updates) {
                    mgrs.a2h.processReceivedSyncData(updates);
                    mgrs.a2h.hubSyncFinished(); },
                function (code, errtxt) {
                    mgrs.a2h.handleSyncError(code, errtxt);
                    mgrs.a2h.hubSyncFinished(); }); },
        hubSyncFinished: function () {
            jt.out("modindspan", "");  //turn off work indicator
            syt.tmo = null;
            syt.stat = "";
            if(syt.resched) {
                syt.resched = false;
                mgrs.a2h.syncToHub(); } },
        makeSendSyncData: function () {
            //send the current account + any songs that need sync.  If just
            //signed in, then don't send the current song or anything else
            //until after the initial download sync.
            var curracct = mgrs.locam.getAccount();
            upldsongs = [];
            if(!curracct.syncsince) {  //not initial account creation
                upldsongs = Object.values(app.svc.dispatch("loc", "songs"))
                    .filter((s) => s.lp > (s.modified || ""));
                upldsongs = upldsongs.slice(0, 199); }
            mgrs.hcu.serializeAccount(curracct);
            var obj = {email:curracct.email, token:curracct.token,
                       syncdata: JSON.stringify([curracct, ...upldsongs])};
            mgrs.hcu.deserializeAccount(curracct);
            return jt.objdata(obj); },
        processReceivedSyncData: function (updates) {
            //received account + any songs that need to be saved locally.
            //Similar logic on server has already written the data to disk,
            //so just need to reflect in current runtime.
            var curracct = mgrs.locam.getAccount();
            var changed = mgrs.locam.noteReturnedCurrAcct(updates[0],
                                                          curracct.token);
            if(changed) { //need to rebuild display with updated info
                mgrs.locam.notifyAccountChanged(); }
            var songs = updates.slice(1);
            jt.log("processReceivedSyncData " + songs.length + " songs.");
            songs.forEach(function (s) {
                app.svc.dispatch("loc", "noteUpdatedSongData", s); });
            jt.out("modindspan", "");
            if(curracct.syncsince && curracct.syncsince < curracct.modified) {
                mgrs.a2h.syncToHub(); } }
    };  //end mgrs.a2h returned functions
    }());


    //Hub To Account manager handles changes to DiggerHub account info where
    //the change first needs to take effect at DiggerHub, then be reflected
    //locally.  This is in contrast to things like settings which are
    //reflected first locally and then synchronized with DiggerHub.
    mgrs.h2a = (function () {
        //changing email requires prompting for a password to create a new
        //token. Leaving email as read-only for now.
        var mafs = [{n:"email", x:true},
                    {n:"firstname", d:"first name", p:"Name for display"},
                    {n:"hashtag", p:"Your unique user tag", wr:true},
                    {n:"guides", d:"guides", x:"guides", wr:true},
                    {n:"modified", d:"last sync", x:"locdt"}];
    return {
        chooseAccount: function () {
            function removeAccountLink (ai) {
                if(ai.dsId === "101") { return ""; }
                return ["a", {href:"#remove",
                              onclick:mdfs("h2a.removeAccount", ai.dsId)},
                        ["img", {cla:"rowbuttonimg",
                                 src:"img/trash.png"}]]; }
            var ars = mgrs.locam.getAcctsInfo().accts.map((ai) =>
                ["tr",
                 [["td",
                   ["div", {cla:"dachoicediv"},
                    ["a", {href:"#" + ai.firstname,
                           onclick:mdfs("h2a.selectAccount", ai.dsId)},
                     ai.firstname]]],
                  ["td", removeAccountLink(ai)]]]);
            ars.push(["tr",
                      ["td", {colspan:2},
                       ["div", {cla:"dachoicediv"},
                        ["a", {href:"#add",
                               onclick:mdfs("h2a.signInOrJoin")},
                         "Add Account"]]]]);
            jt.out("topdlgdiv", jt.tac2html(
                ["div", {id:"hubacctseldiv"},
                 ["table", ars]])); },
        selectAccount: function (aid) {
            var acctsinfo = mgrs.locam.getAcctsInfo();
            acctsinfo.currid = aid;
            mgrs.locam.noteUpdatedAccountsInfo(acctsinfo);
            mgrs.h2a.accountSettings(); },
        removeAccount: function (aid) {
            jt.out("topstatdiv", "Removing account...");
            var aci = mgrs.locam.getAcctsInfo();
            if(aid === aci.currid) {
                aci.currid = "101"; }
            aci.accts = aci.accts.filter((a) => a.dsId !== aid);
            mgrs.locam.updateAccount(
                function (acctsinfo) {
                    jt.out("topstatdiv", "");
                    mgrs.locam.noteUpdatedAccountsInfo(acctsinfo);
                    mgrs.gen.togam("close"); },
                function (code, errtxt) {
                    jt.out("topstatdiv", code + ": " + errtxt); }); },
        changePwdForm: function () {
            jt.out("topdlgdiv", jt.tac2html(
                ["div", {id:"siojfdiv"},
                 [["table",
                   ["tr",
                    [["td", {cla:"formattr"}, "new password"],
                     ["td", ["input", {type:"password", id:"pwdin"}]]]]],
                  ["div", {id:"chgpwdstatdiv"}],
                  ["div", {id:"chgpwdbuttonsdiv", cla:"dlgbuttonsdiv"},
                   ["button", {type:"button", id:"chgpwdb",
                               onclick:mdfs("h2a.changePassword")},
                    "Change Password"]]]])); },
        changePassword: function () {
            jt.byId("chgpwdb").disabled = true;
            var curracct = mgrs.locam.getAccount();
            curracct.updemail = curracct.email;
            curracct.updpassword = jt.byId("pwdin").value;
            mgrs.h2a.updateHubAccount(
                function () {
                    delete curracct.updemail;     //remove temporary form attr
                    delete curracct.updpassword;  //remove temporary form attr
                    mgrs.h2a.accountSettings(); },
                function (code, errtxt) {
                    jt.byId("chgpwdb").disabled = false;
                    jt.out("chgpwdstatdiv", code + ": " + errtxt); }); },
        signOut: function () {
            mgrs.h2a.removeAccount(mgrs.locam.getAccount().dsId); },
        usingDefaultAccount: function () {
            var curracct = mgrs.locam.getAccount();
            if(!curracct || curracct.dsId === "101") {
                return true; }
            return false; },
        acctTopActionsHTML: function () {
            var tas = [
                {h:"#switch", oc:"h2a.chooseAccount", t:"switch accounts"},
                {h:"#chgpwd", oc:"h2a.changePwdForm", t:"change password"},
                {h:"#signout", oc:"h2a.signOut", t:"sign out"}];
            if(mgrs.h2a.usingDefaultAccount()) {
                tas = tas.slice(0, 1); }
            return jt.tac2html(
                ["div", {id:"hubaccttopdiv"},
                 tas.map((ta) =>
                     jt.tac2html(["a", {href:ta.h, onclick:mdfs(ta.oc)}, ta.t]))
                 .join(" &nbsp;|&nbsp ")]); },
        inputOrDispText: function (fd) {
            var curracct = mgrs.locam.getAccount();
            if(fd.x || mgrs.h2a.usingDefaultAccount()) {
                var value = curracct[fd.n];
                if(fd.x === "guides") {
                    value = mgrs.gin.accountFormDisplayValue(); }
                if(fd.x === "locdt") {
                    value = jt.tz2human(value); }
                return ["span", {id:"fmvspan" + fd.n, cla:"formvalspan"},
                        value]; }
            return ["input", {type:"text", id:fd.n + "in",
                              placeholder:fd.p || "", value:curracct[fd.n]}]; },
        acctFieldsHTML: function () {
            var uda = mgrs.h2a.usingDefaultAccount();
            var updbutton = "";
            if(!uda) {
                updbutton = ["button", {type:"button", id:"acctfldsupdb",
                               onclick:mdfs("h2a.updAcctFlds")},
                             "Update Account"]; }
            return jt.tac2html(
                ["div", {id:"hubacctfldsdiv"},
                 [["table",
                   mafs.filter((fd) => !(fd.wr && uda))
                   .map((fd) =>
                       ["tr",
                        [["td", {cla:"formattr"}, fd.d || fd.n],
                         ["td", mgrs.h2a.inputOrDispText(fd)]]])],
                  ["div", {id:"accupdstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv"},
                   updbutton]]]); },
        updAcctFlds: function () {
            jt.out("accupdstatdiv", "");  //clear any previous message
            var curracct = mgrs.locam.getAccount();
            var changed = false;
            mafs.forEach(function (fd) {
                if(!fd.x) { //not disabled input
                    var val = jt.byId(fd.n + "in").value.trim();
                    if(val !== curracct[fd.n]) {
                        changed = true;
                        curracct[fd.n] = val; }} });
            if(changed) {
                mgrs.h2a.updateHubAccount(
                    function () {
                        jt.out("accupdstatdiv", "Account updated."); },
                    function (code, errtxt) {
                        jt.out("accupdstatdiv", code + ": " + errtxt); }); } },
        updateHubAccount: function (contf, errf) {  //curracct already updated
            var data = mgrs.hcu.accountAsData(mgrs.locam.getAccount());
            app.svc.dispatch(
                "loc", "updateHubAccount", data,
                function (accntok) {
                    mgrs.h2a.writeUpdAcctToAccounts(accntok);
                    if(contf) {
                        contf(accntok); } },
                function (code, errtxt) {
                    jt.log("hub.h2a.updateHubAccount " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); } }); },
        writeUpdAcctToAccounts: function (accntok, contf, errf) {
            mgrs.locam.noteReturnedCurrAcct(accntok[0], accntok[1]);
            mgrs.gen.updateAccount(
                function (acctsinfo) {
                    mgrs.locam.noteUpdatedAccountsInfo(acctsinfo);
                    if(contf) {
                        contf(acctsinfo); } },
                function (code, errtxt) {
                    jt.log("writeUpdAcctToAccounts " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); } }); },
        accountSettings: function () {
            jt.out("topdlgdiv", jt.tac2html(
                [mgrs.h2a.acctTopActionsHTML(),
                 mgrs.h2a.acctFieldsHTML()])); },
        showSignInJoinForm: function () {
            jt.out("topdlgdiv", jt.tac2html(
                ["div", {id:"siojfdiv"},
                 [["table",
                   [["tr", {id:"firstnamerow", style:"display:none;"},
                     [["td", {cla:"formattr"}, "first name"],
                      ["td", ["input", {type:"text", id:"firstnamein",
                                        placeholder:"UI display name"}]]]],
                    ["tr",
                     [["td", {cla:"formattr"}, "email"],
                      ["td", ["input", {type:"email", id:"emailin",
                                        placeholder:"nospam@example.com"}]]]],
                    ["tr",
                     [["td", {cla:"formattr"}, "password"],
                      ["td", ["input", {type:"password", id:"pwdin"}]]]],
                    ["tr",
                     ["td", {colspan:2},
                      [["input", {type:"checkbox", id:"siotcb", checked:true,
                                  onclick:mdfs("h2a.togsioj", "event")}],
                       ["label", {fo:"siotcb", cla:"cblab"},
                        "Create new hub account"]]]]]],
                  ["div", {id:"siojstatdiv"}],
                  ["div", {id:"siojerrhelpdiv"}],
                  ["div", {id:"siojbuttonsdiv", cla:"dlgbuttonsdiv"}]]]));
            mgrs.h2a.togsioj(); },
        togsioj: function () {
            var signinb = jt.byId("signinb");
            var newacctb = jt.byId("newacctb");
            if(signinb || (!signinb && !newacctb)) {
                jt.byId("firstnamerow").style.display = "table-row";
                jt.out("siojbuttonsdiv", jt.tac2html(
                    ["button", {type:"button", id:"newacctb",
                                onclick:mdfs("h2a.signInOrJoin", "newacct")},
                     "Create Account"])); }
            else {
                jt.byId("firstnamerow").style.display = "none";
                jt.out("siojbuttonsdiv", jt.tac2html(
                    ["button", {type:"button", id:"signinb",
                                onclick:mdfs("h2a.signInOrJoin", "acctok")},
                     "Sign In"])); } },
        siojbDisable: function (disabled) {
            var bids = ["newacctb", "signinb"];
            bids.forEach(function (bid) {
                if(jt.byId(bid)) {
                    jt.byId(bid).disabled = disabled; } }); },
        siojErrHelp: function (errtxt) {
            if(errtxt.toLowerCase().indexOf("wrong password") >= 0) {
                jt.out("siojerrhelpdiv", jt.tac2html(
                    ["a", {href:"#pwdreset", title:"Send password reset email",
                           onclick:mdfs("h2a.emailPwdReset")},
                     "Send password reset"])); } },
        emailPwdReset: function () {
            jt.out("siojerrhelpdiv", "");
            var data = jt.objdata({email:jt.byId("emailin").value});
            app.svc.dispatch("loc", "emailPwdReset", data,
                function () {
                    jt.out("siojstatdiv", "Reset password link sent."); },
                function (code, errtxt) {
                    jt.out("siojstatdiv", "Reset failed " + code + ": " +
                           errtxt); }); },
        signInOrJoin: function (endpoint) {
            if(!jt.byId("siojfdiv")) {  //form not displayed yet
                return mgrs.h2a.showSignInJoinForm(); }
            mgrs.h2a.siojbDisable(true);
            var data = jt.objdata(
                {email:jt.byId("emailin").value,
                 password:jt.byId("pwdin").value,
                 firstname:jt.byId("firstnamein").value});
            var errf = function (code, errtxt) {
                mgrs.h2a.siojbDisable(false);
                jt.out("siojstatdiv", code + ": " + errtxt);
                mgrs.h2a.siojErrHelp(errtxt); };
            app.svc.dispatch("loc", "signInOrJoin", endpoint, data,
                    function (accntok) {
                        accntok[0].syncsince = accntok[0].created + ";1";
                        mgrs.h2a.writeUpdAcctToAccounts(accntok,
                            function () {
                                mgrs.a2h.syncToHub();
                                mgrs.h2a.accountSettings(); },
                            errf); },
                    errf); },
        displayAccountInfo: function () {
            var aci = mgrs.locam.getAcctsInfo();
            var ca = mgrs.locam.getAccount();
            if(!aci || !aci.accts.length ||
               (aci.accts.length === 1 && aci.accts[0].dsId === "101")) {
                mgrs.h2a.signInOrJoin(); }
            else {  //have acctsinfo with at least one real account
                if(aci.currid) {
                    ca = aci.accts.find((a) => a.dsId === aci.currid); }
                if(ca) {
                    mgrs.h2a.accountSettings(); }
                else {  //choose from existing accounts or add new
                    mgrs.h2a.chooseAccount(); } } },
        noteSyncCompleted: function () {
            var ca = mgrs.locam.getAccount();
            if(jt.byId("fmvspanmodified")) {
                var lastsync = ca.syncsince || ca.modified;
                jt.out("fmvspanmodified", jt.tz2human(lastsync)); } }
    };  //end mgrs.h2a returned functions
    }());


    function makeFetchMergeProcessor (g) { return (function () {
        var guide = g;
        var logpre = "FMP " + guide.dsId + " ";
        var state = "stopped";
        var ca = mgrs.locam.getAccount();
        var params = jt.objdata({email:ca.email, at:ca.token,
                                 aid:ca.dsId, gid:guide.dsId});
        var pfs =
    { //processing functions
        procupd: function (msg) {
            mgrs.gin.fmpStatus(guide, msg); },
        noteUpdatedGuideInfo: function (updg) {
            guide = updg;
            pfs.procupd();  //reflect updated guide info in display
            var gidx = ca.guides.findIndex((g) => g.dsId === guide.dsId);
            ca[gidx] = guide; },
        fetch: function () {
            pfs.procupd("Fetching ratings...");
            app.svc.dispatch("loc", "fetchGuideData", guide.dsId, params,
                function (updg) {  //updg has updated lastrating/lastcheck
                    pfs.noteUpdatedGuideInfo(updg);
                    pfs.merge(); },
                function (code, errtxt) {
                    pfs.procupd("guidedat failed " + code + ": " + errtxt);
                    state = "stopped"; }); },
        merge: function () {
            if(state === "stopped") {
                return pfs.procupd(); }  //aborted while waiting
            pfs.procupd("Importing ratings...");
            app.svc.dispatch("loc", "mergeGuideData", guide.dsId, params,
                function ([updg, dbo]) {
                    pfs.noteUpdatedGuideInfo(updg);
                    app.svc.dispatch("loc", "rebuildSongData", dbo);
                    if(guide.lastcheck > guide.lastrating) { //done fetching
                        state = "stopped"; }
                    else {
                        pfs.fetch(); } },
                function (code, errtxt) {
                    pfs.procupd("ratimp failed " + code + ": " + errtxt);
                    state = "stopped"; }); }
    };  //end processing functions
    return {
        stop: function () {
            state = "stopped";
            jt.log(logpre + "stopped."); },
        start: function () {
            if(state !== "running") {
                state = "running";
                jt.log(logpre + " started.");
                pfs.fetch(); } },
        removeGuideData: function (contf) {
            state = "stopped";
            pfs.procupd("Removing default ratings...");
            app.svc.dispatch("loc", "removeGuideRatings", guide.dsId, params,
                function (dbo) {
                    app.svc.dispatch("loc", "rebuildSongData", dbo);
                    pfs.procupd();
                    contf(); },
                function (code, errtxt) {
                    pfs.procupd("removeGuideData failed " + code + ": " +
                                errtxt); }); }
    };  //end makeFetchMergeProcessor returned functions
    }()); }



    //The guide input manager handles adding/removing guides and getting
    //input from them for songs that have not been rated yet.
    mgrs.gin = (function () {
        var gdesc = "Add a digger friend you know to help rate unrated songs in your library";
        var cg = null;   //current guide being displayed
        var gdmps = {};  //instantiated guide data merge processors
    return {
        accountFormDisplayValue: function () {
            var ca = mgrs.locam.getAccount();
            var html = [];
            ca.guides = ca.guides || [];
            ca.guides.forEach(function (g, idx) {
                html.push([["a", {href:"#digger" + g.dsId,
                                  title:"View details for " + g.email,
                                  onclick:mdfs("gin.showGuide", idx)},
                            g.firstname],
                           ["span", {cla:"sepcomspan"}, ","]]); });
            html.push(["a", {href:"#addguide", title:gdesc,
                             onclick:mdfs("gin.addGuideDialog")},
                       "add guide"]);
            return jt.tac2html(["span", {cla:"guidelinksspan"}, html]); },
        addGuideDialog: function () {
            jt.out("topdlgdiv", jt.tac2html(
                ["div", {id:"guidedlgdiv"},
                 [["table",
                   [["tr",
                     ["td", {colspan:2}, "Get help with unrated songs"]],
                    ["tr",
                     [["td", {cla:"formattr"}, "email"],
                      ["td", ["input", {type:"email", id:"emailin",
                                        placeholder:"friend@example.com"}]]]]]],
                  ["div", {id:"amgstatdiv"}],
                  ["div", {id:"amgbuttonsdiv", cla:"dlgbuttonsdiv"},
                   ["button", {type:"button", id:"addguideb",
                               onclick:mdfs("gin.processGuideAdd")},
                    "Add Guide"]]]])); },
        verifyGuideEmail: function (emaddr) {
            var ca = mgrs.locam.getAccount();
            var okgem = {email:emaddr, err:""};
            if(!jt.isProbablyEmail(okgem.email)) {
                okgem.err = "Digger email address required."; }
            okgem.email = okgem.email.trim().toLowerCase();
            if(okgem.email === ca.email) {
                okgem.err = "A guide is someone other than you."; }
            else if(ca.guides &&
                    ca.guides.find((g) => g.email === okgem.email)) {
                okgem.err = okgem.email + " is already a guide."; }
            return okgem; },
        processGuideAdd: function () {
            jt.out("amgstatdiv", "");
            var okgem = mgrs.gin.verifyGuideEmail(jt.byId("emailin").value);
            if(okgem.err) {
                return jt.out("amgstatdiv", okgem.err); }
            jt.byId("addguideb").disabled = true;
            var ca = mgrs.locam.getAccount();
            var data = jt.objdata({email:ca.email, at:ca.token,
                                   gmaddr:okgem.email});
            app.svc.dispatch("loc", "addGuide", data,
                function (accts) {
                    mgrs.locam.noteReturnedCurrAcct(accts[0], ca.token);
                    mgrs.gin.showGuide(0); },
                function (code, errtxt) {
                    jt.byId("addguideb").disabled = false;
                    jt.out("amgstatdiv", code + ": " + errtxt); }); },
        showGuide: function (gidx) {
            cg = mgrs.locam.getAccount().guides[gidx];
            jt.out("topdlgdiv", jt.tac2html(
                ["div", {id:"guidedlgdiv"},
                 [["div",
                   [["span", {id:"guidelabelspan"}, "Guide: "],
                    ["span", {id:"guideinfospan"},
                     [["span", {id:"guideinfonamespan"},
                       ["a", {href:"#playlist",
                              title:"Show " + cg.firstname + "'s playlist",
                              onclick:mdfs("gin.showPlaylist",
                                           (cg.hashtag || cg.dsId))},
                        cg.firstname]],
                      " (",
                      ["a", {href:"mailto:" + cg.email}, cg.email], ")"]]]],
                  ["div", {id:"cgsongcheckdiv", cla:"cblab"}],
                  ["div", {id:"cgfilleddiv", cla:"cblab"}],
                  ["div", {id:"guidestatdiv"}],
                  ["div", {id:"guidebuttonsdiv", cla:"dlgbuttonsdiv"},
                   [["a", {href:"#remove", style:"margin:0px 10px 0px 0px",
                           title:"Remove " + cg.firstname + " from guides.",
                           onclick:mdfs("gin.removeGuide", gidx)},
                     ["img", {cla:"rowbuttonimg",
                              src:"img/trash.png"}]],
                   ["button", {type:"button", id:"gratb",
                               onclick:mdfs("gin.startFetchMerge", gidx)},
                    "Check For Ratings"]]]]]));
            mgrs.gin.refreshGuideDisplay();
            mgrs.gin.startFetchMerge(); },
        refreshGuideDisplay: function () {
            var dispchecked = "never";
            if(cg.lastcheck) {
                dispchecked = jt.tz2human(cg.lastcheck); }
            jt.out("cgsongcheckdiv", (cg.songcount || "No") +
                   " ratings, checked " + dispchecked);
            jt.out("cgfilleddiv", (cg.filled || "No") + 
                   " default ratings in use.");
            jt.byId("gratb").disabled = false;
            jt.out("guidestatdiv", ""); },
        startFetchMerge: function () {
            if(!gdmps[cg.dsId]) {
                gdmps[cg.dsId] = makeFetchMergeProcessor(cg); }
            gdmps[cg.dsId].start(); },
        fmpStatus: function (guide, msg) {
            if(cg && cg.dsId === guide.dsId) {
                cg = guide;
                mgrs.gin.refreshGuideDisplay();
                jt.out("guidestatdiv", msg || ""); } },
        showPlaylist: function (ident) {  //hashtag or id
            //open a new window for https://diggerhub.com/playlist/ident
            jt.err("playlist/" + ident + " not available at server yet"); },
        removeGuide: function (gidx) {
            var ca = mgrs.locam.getAccount();
            var remg = ca.guides[gidx];
            //makeFetchMergeProcessor already called when guide selected
            gdmps[remg.dsId].removeGuideData(function () {
                delete gdmps[remg.dsId];
                jt.out("guidestatdiv", "Removing " + remg.firstname + "...");
                ca.guides.splice(gidx, 1);
                mgrs.h2a.updateHubAccount(
                    function () {
                        mgrs.h2a.accountSettings(); },
                    function (code, errtxt) {
                        jt.out("guidestatdiv", "Remove failed " + code + ": " +
                               errtxt); }); }); }
    };  //end mgrs.gin returned functions
    }());


    //Local Account manager handles hub account info from local server.
    mgrs.locam = (function () {
        var hai = null;  //hub accounts info (verified server side)
        var curracct = null;  //current account in use
    return {
        getAcctsInfo: function () { return hai; },
        noteReturnedCurrAcct: function (acct, token) {
            mgrs.hcu.deserializeAccount(acct);
            mgrs.hcu.verifyDefaultAccountFields(acct);
            acct.token = token;  //not included in returned data
            var changed = mgrs.hcu.accountDisplayDiff(curracct, acct);
            curracct = acct;
            hai.currid = acct.dsId;
            hai.accts = [acct,
                         ...hai.accts.filter((a) => a.dsId !== acct.dsId)];
            app.svc.dispatch("loc", "noteUpdatedAcctsInfo", hai);
            mgrs.hcu.verifyClientVersion();
            mgrs.h2a.noteSyncCompleted();
            return changed; },
        noteUpdatedAccountsInfo: function (acctsinfo) {
            curracct = null;  //clear any stale ref
            hai = acctsinfo;
            if(!hai || !hai.currid) {
                throw("Bad acctsinfo"); }
            hai.accts.forEach(function (acct) {
                acct.settings = acct.settings || {}; });
            curracct = hai.accts.find((a) => a.dsId === hai.currid);
            if(!curracct) {
                throw("No current account found"); }
            jt.out("hubtogspan", curracct.firstname); },
        updateAccount: function (contf, errf) {  //curracct updated by caller
            app.svc.dispatch("loc", "updateAccount", hai,
                function (acctsinfo) {
                    mgrs.locam.noteUpdatedAccountsInfo(acctsinfo);
                    mgrs.a2h.syncToHub();
                    if(contf) {  //calls notifyAccountChanged if needed
                        contf(acctsinfo); } },
                function (code, errtxt) {
                    jt.log("hub.locam.updateAccount " + code + ": " + errtxt);
                    if(errf) {
                        errf(code, errtxt); } }); },
        notifyAccountChanged: function (context) {
            if(!context || context === "keywords") {
                mgrs.kwd.rebuildKeywords();
                app.player.dispatch("kwd", "rebuildToggles");
                app.filter.dispatch("btc", "rebuildControls"); }
            if(!context || context === "igfolders") {
                mgrs.igf.redrawIgnoreFolders(); }
            if(!context || context === "settings") {
                app.filter.dispatch("stg", "rebuildAllControls"); } },
        initialDataLoaded: function () {
            var config = app.svc.dispatch("loc", "getConfig");
            mgrs.locam.noteUpdatedAccountsInfo(config.acctsinfo);
            mgrs.kwd.rebuildKeywords(); },
        dispAcct: function () { mgrs.h2a.accountSettings(); },
        getAccount: function () { return curracct; }
    };  //end mgrs.locam returned functions
    }());


    ////////////////////////////////////////////////////////////
    // Web Account actions
    ////////////////////////////////////////////////////////////

    //web account manager handles account/services when running on diggerhub
    mgrs.webam = (function () {
    return {
        initialDataLoaded: function () {
            jt.log("webam.initialDataLoaded not implemented yet"); },
        dispAcct: function () {
            jt.log("webam.dispAcct not implemented yet"); },
        getAccount: function () {
            jt.log("webam.getAccount not implemented yet"); },
        updateAccount: function (/*contf, errf*/) {
            jt.log("webam.updateAccount not implemented yet"); }
    };
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
            app.init2(); },
        updateConfig: function () {
            cdat.musicPath = jt.byId("mlibin").value;
            cdat.dbPath = jt.byId("dbfin").value;
            app.svc.dispatch("loc.writeConfig",
                function () { mgrs.cfg.restart(); },
                function (code, errtxt) {
                    jt.out("configstatdiv", "Config update failed " +
                           code + ": " + errtxt); }); },
        launch: function () {
            var config = app.svc.dispatch("loc", "getConfig");
            cdat = {musicPath:config.musicPath, dbPath:config.dbPath};
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
            if(confirm("Restart the app to change the location of music files or data?")) {
                mgrs.cfg.launch(); } }
    };  //end of mgrs.cfg returned functions
    }());


    //Ignore Folders manager handles folders to be ignored on scan/play.
    mgrs.igf = (function () {
        var igfolds = null;
        var activeFolderName = "";
    return {
        igMusicFolders: function () {
            jt.out("topdlgdiv", jt.tac2html(
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
            igfolds = mgrs.locam.getAccount().igfolds;
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
                var tr = jt.byId("igftr" + igfolds.indexOf(activeFolderName));
                if(tr) {
                    tr.scrollIntoView();
                    window.scrollTo(0, 0); }
                activeFolderName = ""; }
            var config = app.svc.dispatch("loc", "getConfig");
            jt.out("igfindiv", jt.tac2html(
                [["label", {fo:"igfin"},
                  "Ignore " + config.musicPath + "/**/"],
                 ["input", {type:"text", id:"igfin", size:30}]]));
            jt.out("igfstatdiv", ""); },
        updateIgnoreFolders: function () {
            mgrs.locam.getAccount().igfolds = igfolds;
            jt.out("igfstatdiv", "Updating ignore folders...");
            mgrs.locam.updateAccount(
                function () {
                    jt.out("igfstatdiv", "");
                    mgrs.igf.unmarkIgnoreSongs();
                    mgrs.igf.markIgnoreSongs();
                    app.locam.notifyAccountChanged("igfolders"); },
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
            Object.values(app.svc.songs()).forEach(function (s) {
                if(s.fq.startsWith("I")) {
                    s.fq = s.fq.slice(1); } }); },
        markIgnoreSongs: function () {
            igfolds = igfolds || mgrs.locam.getAccount().igfolds;
            Object.entries(app.svc.songs()).forEach(function ([p, s]) {
                if((!s.fq || !s.fq.match(/^[DU]/)) && mgrs.igf.isIgPath(p)) {
                    //jt.log("Ignoring " + s.ti);  //can be a lot of output..
                    s.fq = "I" + s.fq; } }); },
        isIgPath: function (p) {
            var pes = p.split("/");
            if(pes.length <= 1) {  //top level file, or windows
                pes = p.split("\\"); }
            if(pes.length > 1) {
                return igfolds.some((f) =>
                    (pes[pes.length - 2] === f ||
                     (f.endsWith("*") &&
                      pes[pes.length  - 2].startsWith(f)))); }
            return false; }
    };  //end of mgrs.igf returned functions
    }());


    //Keyword manager handles keywords in use for the library.
    mgrs.kwd = (function () {
        var kwdefs = null;  //curracct kwdefs
        var uka = null;  //update keywords array (UI form data)
        var vizuka = null;  //ignored keywords filtered out
    return {
        countSongKeywords: function () {
            Object.values(kwdefs).forEach(function (kd) { kd.sc = 0; });
            Object.values(app.svc.songs()).forEach(function (song) {
                song.kws = song.kws || "";
                song.kws.csvarray().forEach(function (kw) {
                    if(!kwdefs[kw]) {
                        kwdefs[kw] = {pos:0, sc:0, ig:0}; }
                    kwdefs[kw].sc += 1; }); }); },
        rebuildKeywords: function () {
            kwdefs = mgrs.gen.getAccount().kwdefs;
            mgrs.kwd.countSongKeywords(); },
        makeDefaultKeywords: function () {  //bootstrap before initialDataLoaded
            return {Social: {pos:1, sc:0, ig:0, dsc:""},
                    Personal: {pos:2, sc:0, ig:0, dsc:""},
                    Ambient:{pos:3, sc:0, ig:0, dsc:""},
                    Dance:{pos:4, sc:0, ig:0, dsc:""}}; },
        defsArray: function (actfirst) {
            kwdefs = kwdefs || mgrs.kwd.makeDefaultKeywords();
            var kds = Object.entries(kwdefs).map(function ([k, d]) {
                return {pos:d.pos, sc:d.sc, ig:d.ig, kw:k, dsc:d.dsc}; });
            kds = kds.filter((kd) => !kd.ig);
            kds.sort(function (a, b) {
                if(actfirst) {
                    if(a.pos && b.pos) { return a.pos - b.pos; }
                    if(a.pos && !b.pos) { return -1; }
                    if(!a.pos && b.pos) { return 1; } }
                return a.kw.localeCompare(b.kw); });
            return kds; },
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
            jt.out("topdlgdiv", jt.tac2html(
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
            var ords = [{n:"first", v:1}, {n:"second", v:2}, {n:"third", v:3},
                        {n:"fourth", v:4}];
            ords.reverse().forEach(function (ord) {
                if(!uka.find((kwd) => kwd.pos === ord.v)) {
                    errmsg = "Missing " + ord.n + " keyword."; } });
            if(errmsg) {
                jt.out("kwupdstatdiv", errmsg);
                jt.byId("kwdefupdb").disabled = false; }
            return errmsg; },
        saveKeywordDefs: function () {
            //either showing the full keywords form, or swapping a bowtie ctrl
            if(jt.byId("kwdefupdb")) {  //called from local form
                jt.byId("kwdefupdb").disabled = true;  //debounce button
                jt.out("kwupdstatdiv", "Saving..."); }
            if(mgrs.kwd.keywordDefsError()) { return; }
            uka.forEach(function (kd) {  //update kwdefs directly
                var def = {pos:kd.pos, sc:kd.sc, ig:kd.ig, dsc:kd.dsc || ""};
                var descr = jt.byId(kd.kw + "descrdiv");
                if(descr) {
                    descr = descr.innerText || "";
                    def.dsc = descr.trim(); }
                mgrs.gen.getAccount().kwdefs[kd.kw] = def; });
            mgrs.locam.updateAccount(
                function () {
                    mgrs.lib.togdlg("close");
                    app.locam.notifyAccountChanged("keywords"); },
                function (code, errtxt) {
                    jt.out("kwupdstatdiv", String(code) + ": " + errtxt); }); },
        same: function (kwa, kwb) {  //localeCompare base not yet on mobile
            return kwa.toLowerCase() === kwb.toLowerCase(); },
        addKeyword: function (kwd) {  //called from player
            uka = uka || mgrs.kwd.defsArray();
            var kd = uka.find((kd) => mgrs.kwd.same(kd.kw, kwd));
            if(kd) {  //already exists and not previously deleted, bump count
                kd.sc += 1; }
            else {  //not in current working set
                kd = kwdefs[kwd];
                if(kd) {  //previously existed, add adjusted copy
                    kd = {kw:kwd, pos:0, sc:kd.sc + 1, ig:0}; }
                else {  //brand new keyword
                    kd = {kw:kwd, pos:0, sc:1, ig:0}; }
                uka.push(kd); }
            mdfs("lib.togdlg", "close");  //in case open
            mgrs.kwd.saveKeywordDefs(); },
        swapFilterKeyword: function (kwd, pos) {  //called from filter
            uka = uka || mgrs.kwd.defsArray();
            var prevkd = uka.find((kd) => kd.pos === pos);
            prevkd.pos = 0;
            var currkd = uka.find((kd) => kd.kw === kwd);
            currkd.pos = pos;
            mdfs("lib.togdlg", "close");  //in case open
            mgrs.kwd.saveKeywordDefs("swapFilterKeyword"); }
    };  //end of mgrs.kwd returned functions
    }());


    //Library manager handles lib level actions and data
    mgrs.lib = (function () {
        var acts = [
            {sc:"loc", ty:"cfgp", oc:mdfs("cfg.confirmStart"),
             tt:"Configure music and data file locations", 
             p:"musicPath", n:"Music Files"},
            {sc:"loc", ty:"cfgp", oc:mdfs("cfg.confirmStart"),
             tt:"Configure music and data file locations",
             p:"dbPath", n:"Digger Data"},
            {sc:"loc", ty:"btn", oc:app.dfs("svc", "loc.loadLibrary"),
             tt:"Read all files in the music folder", n:"Read Files"},
            {sc:"loc", ty:"btn", oc:mdfs("igf.igMusicFolders"),
             tt:"Ignore folders when reading music files", n:"Ignore Folders"},
            {sc:"all", ty:"btn", oc:mdfs("kwd.chooseKeywords"),
             tt:"Choose keywords to use for filtering", n:"Choose Keywords"}];
        var svci = null;
    return {
        togdlg: function (cmd) {
            if(!app.svc.dispatch("loc", "getConfig")) { return; }
            var dlgdiv = jt.byId("topdlgdiv");
            if(!cmd && dlgdiv.dataset.mode === "libact") {
                cmd = "close"; }
            if(cmd === "close") {
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = ""; }
            else {  //"open"
                dlgdiv.dataset.mode = "libact";
                mgrs.lib.writeDialogContent(); } },
        writeDialogContent: function () {
            svci = svci || {hdm:app.svc.hostDataManager(),
                            hdmMatch:function (sc) {
                                return sc === "all" || svci.hdm === sc; } };
            if(svci.hdm === "loc") {
                svci.config = app.svc.dispatch("loc", "getConfig"); }
            jt.out("topdlgdiv", jt.tac2html(
                [["div", {cla:"dlgpathsdiv"},
                  acts.filter((a) => svci.hdmMatch(a.sc) && a.ty === "cfgp")
                  .map((a) =>
                      ["div", {cla:"pathdiv"},
                       [["a", {href:"#configure", onclick:a.oc, title:a.tt},
                         ["span", {cla:"pathlabelspan"}, a.n + ": "]],
                        ["span", {cla:"pathspan"}, svci.config[a.p]]]])],
                 ["div", {cla:"dlgbuttonsdiv"},
                  acts.filter((a) => svci.hdmMatch(a.sc) && a.ty === "btn")
                  .map((a) =>
                      ["button", {type:"button", title:a.tt, onclick:a.oc},
                       a.n])]])); }
    };  //end mgrs.lib returned functions
    }());


    ////////////////////////////////////////////////////////////
    // Export actions
    ////////////////////////////////////////////////////////////

    //Export manager handles process of exporting a playlist
    mgrs.exp = (function () {
        var dki = null;
        var xps = [{pn:"Copy music files", av:"loc", mgr:"cpx"},
                   {pn:"Spotify playlist", av:"notyet"},
                   {pn:"bandcamp playlist", av:"nope"},
                   {pn:"SoundCloud playlist", av:"notyet"}];
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
                dki.songs.slice(0, dat.count).map((s) => s.path));
            app.svc.dispatch("cpx", "exportSongs", dat,
                function (xob) {  //interim status display
                    mgrs.exp.displayExportProgress(xob); },
                function (xob) {  //completion
                    mgrs.exp.displayExportProgress(xob);
                    if(xob.spec.markplayed) {  //rebuild deck with newer songs
                        app.deck.update("song export"); } },
                function (code, errtxt) {
                    jt.out("exportdiv", "Copy request failed " + code +
                           ": " + errtxt); }); },
        cpxDialog: function () {  //local copy file export
            var config = app.svc.dispatch("loc", "getConfig");
            jt.out("topdlgdiv", jt.tac2html(
                [["div", {cla:"pathdiv"},
                  [["span", {cla:"pathlabelspan"}, "Copy To:"],
                   ["span", {cla:"pathspan"}, config.exPath]]],
                 ["div", {id:"exportdiv"},
                  [["div", {cla:"expoptdiv"},
                    [["input", {type:"number", id:"xttlin", size:3, value:20,
                                min:1, max:200}],
                     ["label", {fo:"xttlin"}, " songs from on deck"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"plcb", checked:"checked"}],
                     ["label", {fo:"plcb"}, "Make playlist "],
                     ["label", {fo:"m3ufin"}, " file "],
                     ["input", {type:"text", id:"m3ufin", value:"digger.m3u",
                                placeholder:"digger.m3u", size:10}]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"fccb", checked:"checked"}],
                     ["label", {fo:"fccb"}, "Copy music files"]]],
                   ["div", {cla:"expoptdiv"},
                    [["input", {type:"checkbox", id:"mpcb", checked:"checked"}],
                     ["label", {fo:"mpcb"}, "Mark songs as played"]]],
                   ["div", {cla:"dlgbuttonsdiv", id:"exportbuttonsdiv"},
                    ["button", {type:"button", onclick:mdfs("exp.cpxStart")},
                     "Copy Playlist"]]]]])); },
        togdlg: function () {
            var dlgdiv = jt.byId("topdlgdiv");
            if(dlgdiv.dataset.mode === "download") {  //toggle dialog closed
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = "";
                return; }
            dki = app.deck.deckinfo();
            if(!dki.songs.length) { return; }  //nothing to export
            dlgdiv.dataset.mode = "download";  //note dialog open
            var xopts = xps.filter((x) => x.av === app.svc.hostDataManager());
            if(!xopts.length) {
                jt.out("topdlgdiv", jt.tac2html(
                    "No export options currently available.")); }
            else if(xopts.length === 1) {
                mgrs.exp[xopts[0].mgr + "Dialog"](); }
            else {  //choose which export to use
                jt.log("mgrs.exp.togdlg choices not implemented yet");
                mgrs.exp[xopts[0].mgr + "Dialog"](); } }
    };  //end mgrs.exp returned functions
    }());


    ////////////////////////////////////////////////////////////
    // General interface
    ////////////////////////////////////////////////////////////

    //general manager is main interface for the module
    mgrs.gen = (function () {
    return {
        initDisplay: function () {
            jt.out("pantopdiv", jt.tac2html(
                [["div", {id:"titlediv"},
                  [["a", {href:"#DiggerHub", onclick:mdfs("gen.togam")},
                    ["span", {id:"hubtogspan", cla:"titlespan"}, "Digger"]],
                   ["span", {id:"countspan"}, "Loading..."],
                   ["a", {href:"#database", title:"Library Actions",
                          onclick:mdfs("lib.togdlg")},
                    ["img", {cla:"buttonico", src:"img/recordcrate.png"}]],
                   ["a", {href:"#copyplaylist", title:"Copy Deck To Playlist",
                          onclick:mdfs("exp.togdlg")},
                    ["img", {cla:"buttonico", src:"img/export.png"}]]]],
                 ["div", {id:"topdlgdiv", "data-mode":"empty"}],
                 ["div", {cla:"statdiv", id:"topstatdiv"}]])); },
        getAccount: function () {
            return mgrs[app.svc.hostDataManager() + "am"].getAccount(); },
        updateAccount: function (cf, ef) {
            mgrs[app.svc.hostDataManager() + "am"].updateAccount(cf, ef); },
        togam: function (state) {
            var dlgdiv = jt.byId("topdlgdiv");
            if(state === "close" || (!state && dlgdiv.dataset.mode === "am")) {
                dlgdiv.dataset.mode = "empty";
                dlgdiv.innerHTML = ""; }
            else {
                dlgdiv.dataset.mode = "am";  //account management
                mgrs[app.svc.hostDataManager() + "am"].dispAcct(); } },
        initialDataLoaded: function () {
            mgrs[app.svc.hostDataManager() + "am"].initialDataLoaded(); }
    };  //end mgrs.gen returned functions
    }());

return {
    init: function () { mgrs.gen.initDisplay(); },
    initialDataLoaded: function () { mgrs.gen.initialDataLoaded(); },
    markIgnoreSongs: function () { mgrs.igf.markIgnoreSongs(); },
    rebuildKeywords: function () { mgrs.kwd.rebuildKeywords(); },
    dispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.top, args); }
};  //end of module returned functions
}());
