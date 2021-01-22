/*global app, jt */
/*jslint browser, white, fudge, long */

app.hub = (function () {
    "use strict";

    var hai = null;  //hub accounts info
    var curracct = null; 


    function noteUpdatedAccountInfo (acctsinfo) {
        curracct = null;  //clear any stale ref
        hai = acctsinfo;
        if(hai.currid) {
            curracct = hai.accts.find((a) => a.dsId === hai.currid);
            jt.out("hubtogspan", curracct.firstname); }
        else {  //no current account
            jt.out("hubtogspan", "Digger"); }
    }


    function mdfs (mgrfname, ...args) {
        var pstr = app.paramstr(args);
        mgrfname = mgrfname.split(".");
        var fstr = "app.hub.managerDispatch('" + mgrfname[0] + "','" +
            mgrfname[1] + "'" + pstr + ")";
        if(pstr !== ",event") {  //don't return false from event hooks
            fstr = jt.fs(fstr); }
        return fstr;
    }


    function updateAccountInfo (accntok) {
        var acct = accntok[0];
        acct.token = accntok[1];
        curracct = acct;
        hai.currid = acct.dsId;
        hai.accts = [acct, ...hai.accts.filter((a) => a.dsId !== acct.dsId)];
        var data = jt.objdata({acctsinfo:JSON.stringify(hai)});
        jt.call("POST", "/acctsinfo", data,
                function (acctsinfo) {
                    noteUpdatedAccountInfo(acctsinfo); },
                function (code, errtxt) {
                    jt.out("accupdstatdiv", code + ": " + errtxt); },
                jt.semaphore("hub.updateAccountInfo"));
    }


    //General container for all managers, used for dispatch
    var mgrs = {};


    //The local manager handles changes to DiggerHub account info where the
    //change first needs to be reflected locally, then secondarily updated
    //at DiggerHub if a DiggerHub account has been set up.
    mgrs.loc = (function () {
        var tmo = null;  //sync timeout
    return {
        init: function () {
            hai = null;
            curracct = null; },
        updateAcctsInfo: function (acctsinfo) {
            hai = acctsinfo;
            curracct = hai.accts.find((a) => a.dsId === hai.currid); },
        dataLoaded: function () {  //acctsinfo verified server side
            mgrs.loc.updateAcctsInfo(app.db.config().acctsinfo);
            mgrs.loc.notifyAccountChanged(); },
        notifyAccountChanged: function (context) {
            if(!context || context === "keywords") {
                app.db.managerDispatch("kwd", "rebuildKeywords");
                app.player.managerDispatch("kwd", "rebuildToggles");
                app.filter.managerDispatch("btc", "rebuildControls"); }
            if(!context || context === "igfolders") {
                app.db.managerDispatch("igf", "redrawIgnoreFolders"); }
            if(!context || context === "settings") {
                app.filter.managerDispatch("stg", "rebuildAllControls"); } },
        updateAccount: function (contf, errf) {
            //the curracct data has already been updated by the caller
            //contf calls notifyAccountChanged if needed
            var data = jt.objdata({acctsinfo:JSON.stringify(hai)});
            jt.call("POST", "/acctsinfo", data,  //save to local server
                    function (acctsinfo) {
                        mgrs.loc.updateAcctsInfo(acctsinfo);
                        mgrs.loc.syncToHub();
                        if(contf) {
                            contf(); } },
                    function (code, errtxt) {
                        jt.log("hub.loc.updateAccount " + code + ": " + errtxt);
                        if(errf) {
                            errf(code, errtxt); } },
                    jt.semaphore("hub.updateAccountInfo")); },
        syncToHub: function () {
            jt.log("mgrs.loc.syncToHub not implemented yet. tmo: " + tmo);
            // if(tmo) {  //reset the sync timer if currently waiting
            //     clearTimeout(tmo); }
            // tmo = setTimeout(function () {
            //     tmo = null;
            //     var data = mgrs.loc.makeSyncData();  //curracct + upd songs
            //     jt.call("POST", "/hubsync", data,
            //             function (updates) {
            //                 if received account is more recent {
            //                     curracct = updates[0];
            //                     mgrs.loc.notifyAccountChanged(); }
            //                 app.db.updateSongs(updates.slice(1)); },
            //             function (code, errtxt) {  //probably just offline
            //                 jt.log("syncToHub " + code + ": " + errtxt); },
            //             jt.semaphore("loc.syncToHub")); },
            //                     20 * 1000; );
        }
    };  //end mgrs.loc returned functions
    }());


    //The dialog manager handles changes to DiggerHub account info where the
    //change first needs to take effect at DiggerHub, then be reflected
    //locally.  This is in contrast to things like settings which are
    //reflected first locally and then synchronized with DiggerHub.
    mgrs.dlg = (function () {
        //changing email must prompt for password. Not needed yet.
        var mafs = [{n:"email", x:true},
                    {n:"firstname", d:"first name", p:"Name for display"},
                    {n:"hashtag", p:"Your unique user tag"},
                    {n:"lastsync", d:"last sync", x:true}];
    return {
        chooseAccount: function () {
            var ars = hai.accts.map((ai) =>
                ["tr",
                 [["td",
                   ["div", {cla:"dachoicediv"},
                    ["a", {href:"#" + ai.firstname,
                           onclick:mdfs("dlg.selectAccount", ai.dsId)},
                     ai.firstname]]],
                  ["td",
                   ["a", {href:"#remove",
                          onclick:mdfs("dlg.removeAccount", ai.dsId)},
                    ["img", {cla:"rowbuttonimg",
                             src:"img/trash.png"}]]]]]);
            ars.push(["tr",
                      ["td", {colspan:2},
                       ["div", {cla:"dachoicediv"},
                        ["a", {href:"#add",
                               onclick:mdfs("dlg.signInOrJoin")},
                         "Add Account"]]]]);
            jt.out("dbdlgdiv", jt.tac2html(
                ["div", {id:"hubacctseldiv"},
                 ["table", ars]])); },
        selectAccount: function (aid) {
            hai.currid = aid;
            noteUpdatedAccountInfo(hai);
            mgrs.dlg.accountSettings(); },
        removeAccount: function (aid) {
            jt.out("dbstatdiv", "Removing account...");
            if(aid === hai.currid) {
                hai.currid = 0; }
            hai.accts = hai.accts.filter((a) => a.dsId !== aid);
            var data = jt.objdata({acctsinfo:JSON.stringify(hai)});
            jt.call("POST", "/acctsinfo", data,
                    function (acctsinfo) {
                        jt.out("dbstatdiv", "");
                        noteUpdatedAccountInfo(acctsinfo);
                        mgrs.dlg.displayAccountInfo(); },
                    function (code, errtxt) {
                        jt.out("dbstatdiv", code + ": " + errtxt); },
                    jt.semaphore("dlg.removeAccount")); },
        changePassword: function () {
            jt.out("accupdstatdiv", "changePassword not implemented yet."); },
        signOut: function () {
            mgrs.dlg.removeAccount(curracct.dsId); },
        acctTopActionsHTML: function () {
            var tas = [
                {h:"#switch", oc:"dlg.chooseAccount", t:"switch accounts"},
                {h:"#chgpwd", oc:"dlg.changePassword", t:"change password"},
                {h:"#signout", oc:"dlg.signOut", t:"sign out"}];
            return jt.tac2html(
                ["div", {id:"hubaccttopdiv"},
                 tas.map((ta) =>
                     jt.tac2html(["a", {href:ta.h, onclick:mdfs(ta.oc)}, ta.t]))
                 .join(" &nbsp;|&nbsp ")]); },
        inputOrDispText: function (fd) {
            if(fd.x) { 
                return ["span", {cla:"formvalspan"}, curracct[fd.n]]; }
            return ["input", {type:"text", id:fd.n + "in",
                              placeholder:fd.p || "", value:curracct[fd.n]}]; },
        acctFieldsHTML: function () {
            return jt.tac2html(
                ["div", {id:"hubacctfldsdiv"},
                 [["table",
                   mafs.map((fd) =>
                       ["tr",
                        [["td", {cla:"formattr"}, fd.d || fd.n],
                         ["td", mgrs.dlg.inputOrDispText(fd)]]])],
                  ["div", {id:"accupdstatdiv"}],
                  ["div", {cla:"dlgbuttonsdiv"},
                   ["button", {type:"button", id:"acctfldsupdb",
                               onclick:mdfs("dlg.updAcctFlds")},
                    "Update Account"]]]]); },
        updAcctFlds: function () {
            jt.out("accupdstatdiv", "");  //clear any previous message
            var changed = false;
            mafs.forEach(function (fd) {
                if(!fd.x) { //not disabled input
                    var val = jt.byId(fd.n + "in").value.trim();
                    if(val !== curracct[fd.n]) {
                        changed = true;
                        curracct[fd.n] = val; }} });
            if(changed) {
                //json fields not deserialized, so curracct ready to send
                jt.call("POST", "/updacc", jt.objdata(curracct),
                        function (accntok) {
                            jt.out("accupdstatdiv", "Account updated.");
                            updateAccountInfo(accntok); },
                        function (code, errtxt) {
                            jt.out("accupdstatdiv", code + ": " + errtxt); },
                        jt.semaphore("dlg.updAcctFlds")); } },
        accountSettings: function () {
            jt.out("dbdlgdiv", jt.tac2html(
                [mgrs.dlg.acctTopActionsHTML(),
                 mgrs.dlg.acctFieldsHTML()])); },
        showSignInJoinForm: function () {
            jt.out("dbdlgdiv", jt.tac2html(
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
                                  onclick:mdfs("dlg.togsioj", "event")}],
                       ["label", {fo:"siotcb", cla:"cblab"},
                        "Create new hub account"]]]]]],
                  ["div", {id:"siojstatdiv"}],
                  ["div", {id:"siojbuttonsdiv", cla:"dlgbuttonsdiv"}]]]));
            mgrs.dlg.togsioj(); },
        togsioj: function () {
            var signinb = jt.byId("signinb");
            var newacctb = jt.byId("newacctb");
            if(signinb || (!signinb && !newacctb)) {
                jt.byId("firstnamerow").style.display = "table-row";
                jt.out("siojbuttonsdiv", jt.tac2html(
                    ["button", {type:"button", id:"newacctb",
                                onclick:mdfs("dlg.signInOrJoin", "newacct")},
                     "Create Account"])); }
            else {
                jt.byId("firstnamerow").style.display = "none";
                jt.out("siojbuttonsdiv", jt.tac2html(
                    ["button", {type:"button", id:"signinb",
                                onclick:mdfs("dlg.signInOrJoin", "acctok")},
                     "Sign In"])); } },
        signInOrJoin: function (endpoint) {
            curracct = null;
            if(!jt.byId("siojfdiv")) {  //form not displayed yet
                return mgrs.dlg.showSignInJoinForm(); }
            var data = jt.objdata(
                {"email":jt.byId("emailin").value,
                 "password":jt.byId("pwdin").value,
                 "firstname":jt.byId("firstnamein").value});
            jt.call("POST", "/" + endpoint, data,  // /newacct or /acctok
                    function (accntok) {
                        updateAccountInfo(accntok);
                        mgrs.dlg.accountSettings(); },
                    function (code, errtxt) {
                        jt.out("siojstatdiv", code + ": " + errtxt); },
                    jt.semaphore("dlg.signInOrJoin")); },
        displayAccountInfo: function () {
            if(!hai || !hai.accts.length) {
                mgrs.dlg.signInOrJoin(); }
            else {  //have acctsinfo with at least one account
                if(hai.currid) {
                    curracct = hai.accts.find((a) => a.dsId === hai.currid); }
                if(curracct) {
                    mgrs.dlg.accountSettings(); }
                else {  //choose from existing accounts or add new
                    mgrs.dlg.chooseAccount(); } } }
    };  //end mgrs.dlg returned functions
    }());


    function titleHTML () {
        return jt.tac2html(
            ["a", {href:"#DiggerHub", onclick:jt.fs("app.hub.toggle()")},
             ["span", {id:"hubtogspan", cla:"titlespan"}, "Digger"]]);
    }


    function toggleHubDialog () {
        var dlgdiv = jt.byId("dbdlgdiv");
        if(dlgdiv.dataset.mode === "hub") {  //currently displaying hub dlg
            dlgdiv.dataset.mode = "empty";
            dlgdiv.innerHTML = ""; }
        else {
            dlgdiv.dataset.mode = "hub";
            mgrs.dlg.displayAccountInfo(); }
    }


return {
    init: function () { mgrs.loc.init(); },
    dataLoaded: function () { mgrs.loc.dataLoaded(); },
    curracct: function () { return curracct; },
    titleHTML: function () { return titleHTML(); },
    toggle: function () { toggleHubDialog(); },
    managerDispatch: function (mgrname, fname, ...args) {
        return mgrs[mgrname][fname].apply(app.hub, args); }
};  //end of returned functions
}());
