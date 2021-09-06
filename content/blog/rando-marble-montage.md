---
title: "Random Marble Montage"
date: 2021-09-16 12:00:00
author: "Bentley Davis"
description: "Watch an epic marble montage from a random start point"
layout: base.njk
tags: ["Blog"]
img: "/img/blog/marble_montage.webp"
---
<div class="content">
    <h1>Random Marble Montage</h1>
    <h2>Watch an epic marble montage from a random start point</h2>
    <p>I wanted to be able to drop into this marble montage at a random place so I whipped up this quick page.</p>
    <p>"<a href="https://www.youtube.com/watch?v=b0-IkxXyhmY">When 1,900 3D artists collaberate on one project | Dynamic Machines [ ALL RENDERS ]</a>" video on YoTube where links can be found to the host and creator Clinton Jones</p>
</div>
<div id="r-m-m" class="full-screen"></div>
<style>
    .full-screen {
        width: 100vw;height: 100vh;   
    }
</style>
<script>
    document.getElementById('r-m-m').innerHTML=`
        <iframe id="ytplayer" type="text/html" class="full-screen"
        src="https://www.youtube.com/embed/b0-IkxXyhmY?autoplay=1&loop=1&modestbranding=1&start=${Math.floor(Math.random() * 12880) + 19}&color=white"
        frameborder="0" allowfullscreen>
    `
</script>

