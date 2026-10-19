import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ScheduleItem = ({
  icon,
  title,
  notes = '',
  time,
  remaining,
  iconColor,
  iconBackground,
}) => {
  return (
    <View style={styles.container}>

      {/* Icon */}
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: iconBackground },
        ]}
      >
        <Ionicons
          name={icon}
          size={20}
          color={iconColor}
        />
      </View>

      {/* Time */}
      <Text style={styles.time}>
        {time}
      </Text>

      {/* Activity and note */}
      <View style={styles.details}>
        <Text
          style={styles.title}
          numberOfLines={1}
        >
          {title}
        </Text>
        {notes ? (
          <Text style={styles.notes} numberOfLines={1}>
            {notes}
          </Text>
        ) : null}
      </View>

      {/* Remaining Time */}
      <View style={styles.remainingContainer}>
        <Text style={styles.remaining}>
          {remaining}
        </Text>
      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 51,
  },

  iconContainer: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },

  time: {
    width: 76,
    fontSize: 14,
    fontWeight: '500',
    color: '#17283D',
  },

  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#17283D',
  },

  details: {
    flex: 1,
  },

  notes: {
    marginTop: 2,
    color: '#64748B',
    fontSize: 12,
  },

  remainingContainer: {
    backgroundColor: '#F0F4FA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    marginLeft: 8,
  },

  remaining: {
    fontSize: 11,
    fontWeight: '500',
    color: '#41556F',
  },
});

export default ScheduleItem;
