/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.filter = (function () {
    "use strict";

    var ctrls = {activecolor:"#ffab00",
                 al:{fld:"al", pn:"Approachability", 
                     low:"Social", high:"Challenging"},
                 el:{fld:"el", pn:"Energy Level",
                     low:"Chill", high:"Amped"}};
    var ranger = {panel:{outer:{x:25, y:0, w:244, h:56},
                         inner:{x:27, y:2, w:240, h:54},
                         gradient:{left:"0cd8e5", right:"faee0a"}},
                  vnob:{x:0, y:0, w:21, h:10, maxy:51},
                  hnob:{x:27, y:59, w:10, h:21, maxx:263}};
    var bowtie = {activecolor:ctrls.activecolor,
                  inactivecolor:"#ffffff"};


    function dimstyle (dims, mousearea) {
        var rd = {x:dims.x, y:dims.y, w:dims.w, h:dims.h};
        if(mousearea === "maxy") {
            rd.y += Math.floor(dims.h / 2);
            rd.h = dims.maxy - rd.y; }
        else if(mousearea === "maxx") {
            rd.x += Math.floor(dims.w / 2);
            rd.w = dims.maxx - rd.x; }
        var style = "left:" + rd.x + "px;" +
                    "top:" + rd.y + "px;" +
                    "width:" + rd.w + "px;" +
                    "height:" + rd.h + "px;";
        return style;
    }


    function attachMovementListeners (div, posf) {
        //TODO: attach listeners to get the coords and call the position func
    }


    function attachPointerMovement (cid) {
        ctrls[cid].vpos = function (x, y) {
            ctrls[cid].cy = y - Math.floor(ranger.vnob.h / 2);
            jt.byId(cid + "vnd").style.top = ctrls[cid].cy + "px"; };
        attachMovementListeners(jt.byId(cid + "vmad"), ctrls[cid].vpos);
        ctrls[cid].vpos(0, Math.floor(ranger.vnob.maxy / 2));
        ctrls[cid].hpos = function (x, y) {
            ctrls[cid].cx = x - Math.floor(ranger.hnob.w / 2);
            jt.byId(cid + "hnd").style.left = ctrls[cid].cx + "px"; };
        attachMovementListeners(jt.byId(cid + "hmad"), ctrls[cid].hpos);
        ctrls[cid].hpos(Math.floor(ranger.hnob.maxx / 2), 0);
    }


    function createRangeControl (cid) {
        jt.out(cid + "div", jt.tac2html(
            [["img", {src:"img/ranger.png"}],
             ["div", {cla:"rangetitlediv"}, ctrls[cid].pn],
             ["div", {cla:"rangelowlabeldiv"}, ctrls[cid].low],
             ["div", {cla:"rangehighlabeldiv"}, ctrls[cid].high],
             ["div", {cla:"vnobdiv", id:cid + "vnd",
                      style:dimstyle(ranger.vnob)}],
             ["div", {cla:"hnobdiv", id:cid + "hnd",
                      style:dimstyle(ranger.hnob)}],
             ["div", {cla:"mouseareadiv", id:cid + "vmad",
                      style:dimstyle(ranger.vnob, "maxy")}],
             ["div", {cla:"mouseareadiv", id:cid + "hmad",
                      style:dimstyle(ranger.hnob, "maxx")}]]));
        attachPointerMovement(cid);
    }


    function createBowTieControl (btc, idx) {
        jt.out("btdiv" + idx, jt.tac2html(
            [["div", {cla:"btlabeldiv", id:"btlab" + idx}, btc.pn],
             ["div", {cla:"btbuttonsdiv"},
              [["button", {type:"button", cla:"btleftb", 
                           id:"btb" + idx + "neg",
                           title:"No " + btc.pn + " Songs",
                           onclick:jt.fs("app.filter.bowtieclick(" + idx + 
                                         ",'neg')")}, "-"],
               ["button", {type:"button", cla:"btmidb", 
                           id:"btb" + idx + "off",
                           title:"Unset " + btc.pn + " Filtering",
                           onclick:jt.fs("app.filter.bowtieclick(" + idx + 
                                         ",'off')")}, "o"],
               ["button", {type:"button", cla:"btrightb", 
                           id:"btb" + idx + "pos",
                           title:"Only " + btc.pn + " Songs",
                           onclick:jt.fs("app.filter.bowtieclick(" + idx + 
                                         ",'pos')")}, "+"]]]]));
    }


    function colorWeight (elem, color, weight) {
        elem.style.fontWeight = weight;
        elem.style.color = color;
    }


    function setBowtiePosition (idx, tog) {
        ctrls.bts[idx].tog = tog;
        var bt = {lab:jt.byId("btlab" + idx),
                  bneg:jt.byId("btb" + idx + "neg"),
                  boff:jt.byId("btb" + idx + "off"),
                  bpos:jt.byId("btb" + idx + "pos")};
        switch(tog) {
        case "neg":
            bt.lab.style.textDecoration = "line-through";
            bt.lab.style.fontWeight = "normal";
            colorWeight(bt.bneg, bowtie.activecolor, "bold");
            colorWeight(bt.bpos, bowtie.inactivecolor, "normal");
            break;
        case "off":
            bt.lab.style.textDecoration = "none";
            bt.lab.style.fontWeight = "normal";
            colorWeight(bt.bneg, bowtie.inactivecolor, "normal");
            colorWeight(bt.bpos, bowtie.inactivecolor, "normal");
            break;
        case "pos":
            bt.lab.style.textDecoration = "none";
            bt.lab.style.fontWeight = "bold";
            colorWeight(bt.bneg, bowtie.inactivecolor, "normal");
            colorWeight(bt.bpos, bowtie.activecolor, "bold");
            break; }
    }


    function createMinRatingControl(divid) {
        jt.out(divid, "Min rating control goes here");
    }


    function initControls () {
        var dbo = app.db.data();
        if(!dbo) {
            return; }  //nothing to init with
        jt.out("panfiltdiv", jt.tac2html(
            [["div", {id:"rangesdiv"},
              [["div", {cla:"rangectrldiv", id:"aldiv"}],
               ["div", {cla:"rangectrldiv", id:"eldiv"}]]],
             ["div", {id:"bowtiesdiv"}],
             ["div", {id:"ratdiv"}]]));
        createRangeControl("al");
        createRangeControl("el");
        ctrls.bts = [];
        var btdivs = [];
        //manage which keywords are used from db panel
        dbo.keywords.forEach(function (kwd, idx) {
            ctrls.bts.push({pn:kwd, tog:"off"});
            btdivs.push(["div", {cla:"bowtiediv", id:"btdiv" + idx}]); });
        jt.out("bowtiesdiv", jt.tac2html(btdivs));
        ctrls.bts.forEach(function (bt, idx) {
            createBowTieControl(bt, idx); });
        createMinRatingControl("ratdiv");
    }


return {

    init: function () { initControls(); },
    bowtieclick: function (idx, tog) { setBowtiePosition(idx, tog); }

};  //end of returned functions
}());

