import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

const BottomNavigation = ({ activeTab = 'Home', onTabPress }) => {

  const tabs = [
    {
      name: 'Home',
      icon: 'home',
      inactiveIcon: 'home-outline',
    },
    {
      name: 'Schedule',
      icon: 'calendar',
      inactiveIcon: 'calendar-outline',
    },
    {
      name: 'Finance',
      icon: 'wallet',
      inactiveIcon: 'wallet-outline',
    },
    {
      name: 'Goals',
      icon: 'location',
      inactiveIcon: 'location-outline',
    },
    {
      name: 'Profile',
      icon: 'person',
      inactiveIcon: 'person-outline',
    },
  ];

  return (
    <View style={styles.container}>

      <View style={styles.navigation}>

        {tabs.map((tab) => {

          const isActive = activeTab === tab.name;

          return (
            <Pressable
              key={tab.name}
              style={styles.tab}
              onPress={() => {
                if (onTabPress) {
                  onTabPress(tab.name);
                }
              }}
            >

              <Ionicons
                name={isActive ? tab.icon : tab.inactiveIcon}
                size={27}
                color={isActive ? '#1769E0' : '#8290A1'}
              />

              <Text
                style={[
                  styles.label,
                  isActive && styles.activeLabel,
                ]}
              >
                {tab.name}
              </Text>

            </Pressable>
          );

        })}

      </View>

    </View>
  );
};

const styles = StyleSheet.create({

  container: {
    backgroundColor: '#FFFFFF',

    borderTopWidth: 1,
    borderTopColor: '#EDF1F5',

    paddingBottom: 8,
  },

  navigation: {
    height: 68,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',

    paddingHorizontal: 8,
  },

  tab: {
    flex: 1,

    alignItems: 'center',
    justifyContent: 'center',

    paddingVertical: 4,
  },

  label: {
    marginTop: 4,

    fontSize: 12,
    fontWeight: '500',

    color: '#8290A1',
  },

  activeLabel: {
    color: '#1769E0',
    fontWeight: '600',
  },

});

export default BottomNavigation;