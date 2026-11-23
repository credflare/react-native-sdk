require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name         = 'CredflareFaceVision'
  s.version      = package['version']
  s.summary      = 'Face signals from Apple Vision for the Credflare React Native SDK.'
  s.homepage     = 'https://github.com/credflare/react-native-sdk'
  s.license      = { :type => 'Proprietary' }
  s.authors      = 'Credflare'
  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => 'https://github.com/credflare/react-native-sdk.git', :tag => s.version.to_s }
  s.source_files = ['ios/**/*.swift']
  s.frameworks   = ['AVFoundation', 'Vision']

  load 'nitrogen/generated/ios/CredflareFaceVision+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  s.dependency 'VisionCamera'
  install_modules_dependencies(s)
end
