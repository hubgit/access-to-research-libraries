<?php

header('Access-Control-Allow-Origin: *');

readfile('http://' . $_GET['url']);
