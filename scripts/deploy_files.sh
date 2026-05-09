mkdir to_deploy -p
mkdir to_deploy/offline -p
mkdir to_deploy/player -p
mkdir to_deploy/theme_resources -p

cp website/beepbox_editor.min.js to_deploy/
# TODO: see if something can be done about the bugs the service worker causes
# cp website/service_worker.js to_deploy/

cp website/drumsamples.js to_deploy/
cp website/kirby_samples.js to_deploy/
cp website/samples.js to_deploy/
cp website/samples2.js to_deploy/
cp website/samples3.js to_deploy/
cp website/wario_samples.js to_deploy/
cp website/mario_paintbox_samples.js to_deploy/
cp website/nintaribox_samples.js to_deploy/

cp website/drumsamples.js to_deploy/player
cp website/kirby_samples.js to_deploy/player
cp website/samples.js to_deploy/player
cp website/samples2.js to_deploy/player
cp website/samples3.js to_deploy/player
cp website/wario_samples.js to_deploy/player
cp website/mario_paintbox_samples.js to_deploy/player
cp website/nintaribox_samples.js to_deploy/player

cp website/index.html to_deploy/
cp website/favicon.ico to_deploy/
cp website/beepbox_synth.min.js to_deploy/
cp website/synth_example.html to_deploy/
cp website/offline/jquery-3.4.1.min.js to_deploy/offline/
cp website/offline/select2.min.css to_deploy/offline/
cp website/offline/select2.min.js to_deploy/offline/

cp website/player/* to_deploy/player/ -r
cp website/theme_resources/* to_deploy/theme_resources/ -r
