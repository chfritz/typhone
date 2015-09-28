
DIR=../typhone_build/

meteor build $DIR --server=http://typhone.xyz
# keytool -genkey -alias typhone -keyalg RSA -keysize 2048 -validity 10000
cd $DIR/android/
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 release-unsigned.apk typhone
~/.meteor/android_bundle/android-sdk/build-tools/20.0.0/zipalign 4 release-unsigned.apk production.apk

echo "$DIR/android/production.apk is your apk, now go to https://play.google.com/apps/publish"
