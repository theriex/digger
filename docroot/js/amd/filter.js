/*global app, jt */
/*jslint browser, white, fudge, for, long */

app.filter = (function () {
    "use strict";

    var ctrls = {activecolor:"#ffab00",
                 al:{fld:"al", pn:"Approachability", 
                     low:"Social", high:"Challenging"},
                 el:{fld:"el", pn:"Energy Level",
                     low:"Chill", high:"Amped"}};
    var ranger = {entire:{x:0, y:0, w:270, h:80},
                  panel:{outer:{x:25, y:0, w:244, h:56},
                         inner:{x:27, y:2, w:240, h:54},
                         gradient:{left:"0cd8e5", right:"faee0a"}},
                  vnob:{x:0, y:5, w:21, h:10, maxy:52},
                  hnob:{x:25, y:59, w:10, h:21, maxx:263}};
    var bowtie = {activecolor:ctrls.activecolor,
                  inactivecolor:"#ffffff"};


    function dimstyle (dims, mousearea) {
        var rd = {x:dims.x, y:dims.y, w:dims.w, h:dims.h};
        if(mousearea === "maxy") {
            rd.h = dims.maxy - rd.y; }
        else if(mousearea === "maxx") {
            rd.w = dims.maxx - rd.x; }
        var style = "left:" + rd.x + "px;" +
                    "top:" + rd.y + "px;" +
                    "width:" + rd.w + "px;" +
                    "height:" + rd.h + "px;";
        return style;
    }


    function touchEventToOffsetCoords (event) {
        var rect = event.target.getBoundingClientRect();
        var coords = {x:event.targetTouches[0].pageX - rect.left,
                      y:event.targetTouches[0].pageY - rect.top};
        return coords;
    }


    function attachMovementListeners (divid, stat, posf) {
        var div = jt.byId(divid);
        jt.on(div, "mousedown", function (event) {
            stat.pointingActive = true;
            posf(event.offsetX, event.offsetY); });
        jt.on(div, "mouseup", function (event) {
            stat.pointingActive = false; });
        //Not tracking mouseout to stop pointing, since it is easy to drag
        //past the bounding tracking div while trying to adjust.  Rather err
        //on the side of live than dead for dragging.  Right approach is to
        //capture mouseup at the panel level and stop all pointing.
        // jt.on(div, "mouseout", function (event) {
        //     stat.pointingActive = false; });
        jt.on(div, "mousemove", function (event) {
            if(stat.pointingActive) {
                posf(event.offsetX, event.offsetY); } });
        jt.on(div, "click", function (event) {
            stat.pointingActive = false;
            posf(event.offsetX, event.offsetY); });
        //Touch interfaces are essentially the same as the mouse actions.
        //They may be intermixed on devices that support both interfaces.
        jt.on(div, "touchstart", function (event) {
            stat.pointingActive = true;
            var coords = touchEventToOffsetCoords(event);
            posf(coords.x, coords.y); });
        jt.on(div, "touchend", function (event) {
            stat.pointingActive = false; });
        jt.on(div, "touchcancel", function (event) {
            stat.pointingActive = false; });
        jt.on(div, "touchmove", function (event) {
            if(stat.pointingActive) {
                posf(event.offsetX, event.offsetY); } });
    }


    function attachPointerMovement (cid) {
        var rcr = ctrls[cid];
        //vertical
        rcr.vstat = {pointingActive:false};
        rcr.vpos = function (x, y) {
            rcr.cy = y;  //base vertical offset is zero
            jt.byId(cid + "vnd").style.top = rcr.cy + "px"; };
        attachMovementListeners(cid + "vmad", rcr.vstat, rcr.vpos);
        rcr.vpos(0, Math.floor(ranger.vnob.maxy / 2));
        //horizontal
        rcr.hstat = {pointingActive:false};
        rcr.hpos = function (x, y) {
            rcr.cx = x + ranger.hnob.x;
            jt.byId(cid + "hnd").style.left = rcr.cx + "px"; };
        attachMovementListeners(cid + "hmad", rcr.hstat, rcr.hpos);
        rcr.hpos(Math.floor(ranger.hnob.maxx / 2), 0);
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
        //changing which keywords will be in use is done from the db panel.
        dbo.keywords.forEach(function (kwd, idx) {
            ctrls.bts.push({pn:kwd, tog:"off"});
            btdivs.push(["div", {cla:"bowtiediv", id:"btdiv" + idx}]); });
        jt.out("bowtiesdiv", jt.tac2html(btdivs));
        ctrls.bts.forEach(function (bt, idx) {
            createBowTieControl(bt, idx); });
        createMinRatingControl("ratdiv");
        jt.on("panfiltdiv", "mousedown", function (event) {
            jt.evtend(event); });
    }


return {

    init: function () { initControls(); },
    bowtieclick: function (idx, tog) { setBowtiePosition(idx, tog); }

};  //end of returned functions
}());

